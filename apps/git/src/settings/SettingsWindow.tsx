import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Button, Select, SegmentedControl, TextInput } from "@legendapp/spark/ui";
import { SettingsRow, SettingsSection, VirtualizedSettingsWindow, SettingsPage, SettingsSwitchRow } from "@legendapp/spark/ui/settings";
import { DragDropProvider, DraggableItem, DroppableZone } from "@legend-apps/reorder-controls";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { contextMenuIssues, defaultContextMenus, resolveKeyBindings } from "../actions";
import { commandIds, commandMeta, menuTargets, type CommandMeta, type MenuTarget } from "../commandMeta";
import { defaultShortcut, type CommandId } from "../commands";
import { panelTitles, saveLayoutAs } from "../layout/layoutMenu";
import { capabilityIssues } from "./capabilities";
import { buildAIReferenceDoc } from "./docs";
import { buildSettingsJsonSchema, formatJsonSchema } from "./jsonSchema";
import { deepEqual } from "./merge";
import { activeLayout } from "./presets";
import { fileOnlyKeys, panelIds, presetIds, toolbarWidgets, viewKinds, type GitSettings, type LayoutNode, type MenuEntry, type PanelId, type PresetId } from "./schema";
import { acquireGitSettings, choosePreset, type GitSettingsStore, type LayerId } from "./store";
import { applyImport, checkImport, exportParts, exportPartTitles, exportSettings, importSettings, undoImport, type ExportPart, type ImportUndo } from "./sharing";
import { examplePrompts, generateSettingsPatch } from "./customizeAI";
import { resolveColor, type Appearance } from "./theme";
import type { SettingsIssue } from "./validate";

export const settingsPageIds = ["general", "layout", "panels", "theme", "toolbar", "menus", "keyboard", "ai"] as const;
export type SettingsPageId = (typeof settingsPageIds)[number];

/** What the Settings window shows: the repository of the window it was opened from (null = all repositories) and the page. */
export const settingsTarget$ = observable<{ root: string | null; page: SettingsPageId }>({ root: null, page: "general" });

type Pane = {
  store: GitSettingsStore;
  settings: GitSettings;
  root: string | null;
  scope: LayerId;
  setScope(scope: LayerId): void;
  /** Writes one key of the scope's layer; undefined resets it to the layer below. */
  set(path: readonly string[], value: unknown): void;
  windowId: string;
};
const PaneContext = createContext<Pane | null>(null);
const usePane = () => useContext(PaneContext)!;

const dialogs = () => require("@legendapp/spark/dialogs") as typeof import("@legendapp/spark/dialogs");
const report = (windowId: string, title: string) => (error: unknown) => {
  void dialogs().showMessage({ windowId, kind: "warning", title, message: error instanceof Error ? error.message : String(error) }).catch(console.error);
};
const presetTitles: Record<string, string> = { sourcetree: "SourceTree", fork: "Fork", gitkraken: "GitKraken" };
const layoutTitle = (name: string) => presetTitles[name] ?? name;
const titleCase = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase());

// ── Shared rows ──────────────────────────────────────────────────────────────

function Choice({ title, description, value, options, onChange }: { title: string; description?: string; value: string; options: readonly { label: string; value: string }[]; onChange(value: string): void }) {
  // Spark's Select throws on a value it doesn't list; a file can hold one (Fork's 1.5 pt line width), so it is listed as is.
  const listed = options.some(option => option.value === value) ? options : [...options, { label: value, value }];
  return <SettingsRow label={title} description={description}>
    <Select accessibilityLabel={title} options={listed} value={value} onValueChange={onChange} variant="borderless" style={styles.select} />
  </SettingsRow>;
}

function Toggle({ title, description, value, onChange }: { title: string; description?: string; value: boolean; onChange(value: boolean): void }) {
  return <SettingsSwitchRow
    label={title}
    description={description}
    value={value}
    onValueChange={onChange}
  />;
}

/** The scope popup (every setting below writes to that layer) and Reset to All Repositories for what this repository overrides (spec §6). */
function ScopeRow() {
  const { root, scope, setScope, store } = usePane();
  const repoFile = useValue(() => store.layers$.repo.get()?.file ?? null);
  if (!root) return null;
  const overridden = Object.keys(repoFile ?? {}).filter(key => !(fileOnlyKeys as readonly string[]).includes(key) || key === "extends").map(key => [key]);
  return <SettingsSection>
    <SettingsRow label="Apply To" description={scope === "repo" ? root : "Every repository without its own value."}>
      <View style={styles.inline}>
        <Select accessibilityLabel="Apply To" options={[{ label: "All Repositories", value: "user" }, { label: "This Repository", value: "repo" }]} value={scope} onValueChange={value => setScope(value as LayerId)} style={styles.select} />
        {overridden.length ? <Button onPress={() => { for (const path of overridden) void store.edit("repo", path, undefined); }}>Reset to All Repositories</Button> : null}
      </View>
    </SettingsRow>
  </SettingsSection>;
}

function ReadOnlyNote() {
  const { store, scope } = usePane();
  if (!useValue(() => store.layers$[scope].get()?.readOnly)) return null;
  return <Text style={styles.warning}>{store.paths[scope]} can’t be changed here: it has an error or was written by a newer Legend Git. Fix or replace the file (Import…) first.</Text>;
}

// ── General ──────────────────────────────────────────────────────────────────

function useAllIssues(): SettingsIssue[] {
  const { store, settings } = usePane();
  const stored = useValue(store.issues$);
  return useMemo(() => {
    const all = [...stored, ...capabilityIssues(settings, "settings"), ...contextMenuIssues(settings.contextMenus), ...resolveKeyBindings(settings.keybindings).issues];
    const seen = new Set<string>();
    return all.filter(issue => { const key = `${issue.path} ${issue.message}`; if (seen.has(key)) return false; seen.add(key); return true; });
  }, [stored, settings]);
}

let lastUndo: ImportUndo | null = null;

function GeneralPage() {
  const pane = usePane();
  const { settings, store, scope, set, windowId } = pane;
  const issues = useAllIssues();
  const [part, setPart] = useState<ExportPart>("everything");
  const [undo, setUndo] = useState(lastUndo);
  const layers = useValue(store.layers$);
  const extendsValue = String(layers[scope]?.file?.extends ?? (scope === "repo" ? layers.user?.file?.extends : undefined) ?? "sourcetree");

  async function importFile() {
    const { openFileDialog, showMessage } = dialogs();
    const picked = await openFileDialog({ windowId, selection: "files", multiple: false, title: "Import Settings", filters: [{ name: "Settings", extensions: ["json"] }] });
    if (picked.canceled) return;
    const path = picked.paths[0]!;
    const files = require("@legendapp/spark/files") as typeof import("@legendapp/spark/files");
    const check = checkImport(await files.readText(path), path.split("/").pop());
    if (check.error) { await showMessage({ windowId, kind: "warning", title: "Couldn’t Import Settings", message: check.error }); return; }
    const lines = [
      check.name ? `“${check.name}”${check.author ? ` by ${check.author}` : ""}` : null,
      check.description ?? null,
      "Changes: " + (check.changes.map(change => `${change.area} (${change.keys.join(", ")})`).join("; ") || "nothing"),
      check.issues.length ? `${check.issues.length} issue(s) are skipped: ${check.issues.slice(0, 5).map(issue => `${issue.path}: ${issue.message}`).join("; ")}` : null,
      `Applies to ${scope === "repo" ? "this repository only" : "all repositories"}. Your current file is backed up to ${store.paths[scope]}.bak.`,
    ].filter(Boolean).join("\n\n");
    const result = await showMessage({ windowId, title: "Import Settings?", message: lines, buttons: [{ id: "replace", label: "Replace My Settings" }, { id: "onTop", label: "Apply on Top" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "onTop", cancelButtonId: "cancel" });
    if (result.buttonId !== "replace" && result.buttonId !== "onTop") return;
    lastUndo = await importSettings(store, scope, check.file, result.buttonId);
    setUndo(lastUndo);
  }

  async function exportFile() {
    const { saveFileDialog } = dialogs();
    const picked = await saveFileDialog({ windowId, defaultName: `legend-git-${part}.json`, filters: [{ name: "Settings", extensions: ["json"] }] });
    if (picked.canceled) return;
    const files = require("@legendapp/spark/files") as typeof import("@legendapp/spark/files");
    const file = exportSettings(store.layerFile(scope).file, part, { name: `Legend Git ${exportPartTitles[part]}` });
    await files.writeText(picked.path, `${JSON.stringify(file, null, 2)}\n`);
  }

  function reveal() {
    const path = store.paths[scope]!;
    const { runCommand } = require("@legendapp/spark/processes") as typeof import("@legendapp/spark/processes");
    // A file that doesn't exist yet reveals its folder.
    runCommand({ target: { type: "command", name: "open" }, args: store.layerFile(scope).text === undefined ? [path.slice(0, path.lastIndexOf("/"))] : ["-R", "--", path], timeoutMs: 10_000 }).catch(console.error);
  }

  return <>
    <ScopeRow />
    <ReadOnlyNote />
    <SettingsSection title="Look">
      <Choice title="Preset" description="The base every other setting starts from: layout, toolbar, sidebar, panels and theme." value={extendsValue} options={presetIds.map(id => ({ label: layoutTitle(id), value: id }))}
        onChange={value => { choosePreset(store, scope, value as PresetId).catch(report(windowId, "Couldn’t Change the Preset")); }} />
      <Choice title="Appearance" value={settings.appearance} options={[{ label: "System", value: "system" }, { label: "Light", value: "light" }, { label: "Dark", value: "dark" }]} onChange={value => set(["appearance"], value)} />
      <Choice title="Density" description="Row heights in lists and the diff." value={settings.density} options={[{ label: "Compact", value: "compact" }, { label: "Regular", value: "regular" }, { label: "Comfortable", value: "comfortable" }]} onChange={value => set(["density"], value)} />
    </SettingsSection>
    <SettingsSection title="Settings File">
      <Text className="px-3 py-2 text-sm text-text-secondary">Shared files name commands by id only and never carry window state, paths or tokens.</Text>
      <SettingsRow label="Import…" description="Replace your settings with a shared file, or apply it on top. A backup is written first.">
        <Button onPress={() => { importFile().catch(report(windowId, "Couldn’t Import Settings")); }}>Import…</Button>
      </SettingsRow>
      {undo ? <SettingsRow label="Undo Import" description="Puts back the file as it was before the last import.">
        <Button onPress={() => { undoImport(store, undo).then(() => { lastUndo = null; setUndo(null); }, report(windowId, "Couldn’t Undo the Import")); }}>Undo Import</Button>
      </SettingsRow> : null}
      <SettingsRow label="Export…" description="Writes one shareable .json file.">
        <View style={styles.inline}>
          <Select accessibilityLabel="What to export" options={exportParts.map(id => ({ label: exportPartTitles[id], value: id }))} value={part} onValueChange={value => setPart(value as ExportPart)} style={styles.select} />
          <Button onPress={() => { exportFile().catch(report(windowId, "Couldn’t Export Settings")); }}>Export…</Button>
        </View>
      </SettingsRow>
      <SettingsRow label="Reveal Settings File" description={store.paths[scope] ?? undefined}>
        <Button onPress={reveal}>Show in Finder</Button>
      </SettingsRow>
    </SettingsSection>
    <SettingsSection title="Issues">
      <Text className="px-3 py-2 text-sm text-text-secondary">{issues.length ? "Problems in your settings files, and settings shown differently until macOS pieces land. Nothing here stops the app." : "No issues."}</Text>
      {issues.length ? issues.map((issue, index) => <SettingsRow key={index} label={issue.path || "(file)"} description={`${issue.message} (${issue.file.split("/").pop()})`}>
        <Text style={issue.level === "error" ? styles.error : issue.level === "warning" ? styles.warningText : styles.secondary}>{titleCase(issue.level)}</Text>
      </SettingsRow>) : null}
    </SettingsSection>
  </>;
}

// ── Layout ───────────────────────────────────────────────────────────────────

function Schematic({ node }: { node: LayoutNode }): ReactNode {
  if (node.type === "panel") return <View style={styles.box}><Text style={styles.boxLabel} numberOfLines={1}>{panelTitles[node.panel] ?? node.panel}</Text></View>;
  if (node.type === "switch") return <Schematic node={node.otherwise} />;
  // Sized panes keep their proportion to a 300 pt share for each pane that takes the rest.
  return <View style={[styles.split, { flexDirection: node.direction === "row" ? "row" : "column" }]}>
    {node.children.map((child, index) => <View key={index} style={{ flexGrow: Math.max(child.size ?? 300, 80), flexBasis: 0 }}><Schematic node={child.node} /></View>)}
  </View>;
}

function LayoutPage() {
  const { settings, store, set, windowId } = usePane();
  const base = useValue(store.base$);
  const layout = activeLayout(settings, base);
  const names = [...new Set([...presetIds, ...Object.keys(settings.layout.layouts)])];
  async function saveAs() {
    const result = await dialogs().showPrompt({ windowId, title: "Save Layout As", message: "The active layout is saved in your settings file under this name.", placeholder: "Layout name", confirmLabel: "Save" });
    const name = result.canceled ? "" : result.value.trim();
    if (name) await saveLayoutAs(store, settings, base, name, {});
  }
  return <>
    <SettingsSection title="Layout">
      <Text className="px-3 py-2 text-sm text-text-secondary">Divider positions are window state, kept per window; View ▸ Layout moves panes.</Text>
      <Choice title="Active Layout" value={settings.layout.active} options={names.map(name => ({ label: layoutTitle(name), value: name }))} onChange={value => set(["layout", "active"], value)} />
      <SettingsRow label="Save Layout As…" description="Copies the active layout into a named layout you can edit.">
        <View style={styles.inline}>
          <Button onPress={() => { saveAs().catch(report(windowId, "Couldn’t Save the Layout")); }}>Save Layout As…</Button>
          <Button onPress={() => set(["layout"], undefined)}>Reset to Preset</Button>
        </View>
      </SettingsRow>
    </SettingsSection>
    {(["default", ...viewKinds] as const).filter(kind => kind === "default" || layout.views[kind]).map(kind => <SettingsSection key={kind} title={kind === "default" ? "Default View" : `${titleCase(kind)} View`}>
      <View style={styles.schematic}><Schematic node={(layout.views as Record<string, LayoutNode>)[kind]!} /></View>
    </SettingsSection>)}
  </>;
}

// ── Panels (generated from the schema) ───────────────────────────────────────

type JsonNode = { type?: string; enum?: string[]; minimum?: number; maximum?: number; description?: string; properties?: Record<string, JsonNode>; "x-enumDescriptions"?: Record<string, string> };
let panelSchemaCache: Record<string, JsonNode> | null = null;
const panelSchemas = () => panelSchemaCache ??= ((buildSettingsJsonSchema().properties as Record<string, JsonNode>).panels!.properties!);

function OptionRows({ path, node, value }: { path: string[]; node: JsonNode; value: Record<string, unknown> }) {
  const { set } = usePane();
  return <>{Object.entries(node.properties ?? {}).map(([key, child]) => {
    const title = titleCase(key);
    const at = [...path, key];
    if (child.properties) return <OptionRows key={key} path={at} node={child} value={value[key] as Record<string, unknown>} />;
    const current = value[key];
    const description = child.description;
    if (child.enum) {
      const options = child.enum.map(option => ({ label: titleCase(option), value: option }));
      const optional = key === "density";
      return <Choice key={key} title={title} description={description} value={typeof current === "string" ? current : ""} options={optional ? [{ label: "Window Default", value: "" }, ...options] : options} onChange={next => set(at, next || undefined)} />;
    }
    if (child.type === "boolean") return <Toggle key={key} title={title} description={description} value={!!current} onChange={next => set(at, next)} />;
    if ((child.type === "number" || child.type === "integer") && child.minimum !== undefined && child.maximum !== undefined && child.maximum - child.minimum <= 40) {
      const values = Array.from({ length: child.maximum - child.minimum + 1 }, (_, index) => String(child.minimum! + index));
      return <Choice key={key} title={title} description={description} value={String(current)} options={values.map(option => ({ label: option, value: option }))} onChange={next => set(at, Number(next))} />;
    }
    return <SettingsRow key={key} label={title} description={`${description ?? ""} Edit in the settings file or from the commit list's column menu.`.trim()} />;
  })}</>;
}

function PanelsPage() {
  const { settings } = usePane();
  const shown = panelIds.filter(id => id !== "empty");
  return <>
    {shown.map(panel => <SettingsSection key={panel} title={panelTitles[panel] ?? panel}>
      <Text className="px-3 py-2 text-sm text-text-secondary">{panelSchemas()[panel]?.description}</Text>
      <OptionRows path={["panels", panel]} node={panelSchemas()[panel]!} value={settings.panels[panel as PanelId] as Record<string, unknown>} />
    </SettingsSection>)}
  </>;
}

// ── Theme ────────────────────────────────────────────────────────────────────

const colorPattern = /^(#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?|system:[A-Za-z]+)$/;

/** The native color panel (NSColorPanel), when the build has it; it resolves with the first color picked. */
function colorPanel(): ((initial: string) => Promise<string>) | null {
  try {
    const { ColorPickerModule } = require("@legend-apps/color-picker") as typeof import("@legend-apps/color-picker");
    return initial => ColorPickerModule.showColorPicker(initial);
  } catch { return null; }
}

/** A swatch, the macOS color panel, and the color's text (for `#RRGGBBAA` and `system:` names, which the panel can't pick). */
function ColorRow({ title, path, value, appearance, onRemove }: { title: string; path: string[]; value: string; appearance: Appearance; onRemove?: () => void }) {
  const { set } = usePane();
  const pick = colorPanel();
  return <SettingsRow label={title}>
    <View style={styles.inline}>
      <View style={[styles.swatch, { backgroundColor: resolveColor(value, appearance) }]} />
      {pick ? <Button onPress={() => { pick(resolveColor(value, appearance).slice(0, 7)).then(color => set(path, color), console.error); }}>Choose…</Button> : null}
      <TextInput key={value} accessibilityLabel={title} defaultValue={value} onChangeText={text => { if (colorPattern.test(text.trim()) && text.trim() !== value) set(path, text.trim()); }} style={styles.colorField} />
      {onRemove ? <Button onPress={onRemove}>Remove</Button> : null}
    </View>
  </SettingsRow>;
}

const fontFamilies = ["system-mono", "Menlo", "SF Mono", "Monaco", "Courier New", "JetBrains Mono", "Fira Code"];

function ThemePage() {
  const { settings, set } = usePane();
  const [appearance, setAppearance] = useState<Appearance>("light");
  const tokens = settings.theme[appearance];
  const base = ["theme", appearance];
  const group = (key: "status" | "diff" | "refs") => Object.entries(tokens[key] as Record<string, string>).map(([name, value]) =>
    <ColorRow key={name} title={titleCase(name)} path={[...base, key, name]} value={value} appearance={appearance} />);
  const lanes = tokens.lanes;
  return <>
    <SettingsSection title="Code Font">
      <Text className="px-3 py-2 text-sm text-text-secondary">The UI font always follows macOS.</Text>
      <Choice title="Font" value={settings.theme.fonts.code} options={[...new Set([...fontFamilies, settings.theme.fonts.code])].map(name => ({ label: name === "system-mono" ? "System Monospaced" : name, value: name }))} onChange={value => set(["theme", "fonts", "code"], value)} />
      <Choice title="Size" value={String(settings.theme.fonts.codeSize)} options={Array.from({ length: 13 }, (_, index) => String(index + 9)).map(size => ({ label: `${size} pt`, value: size }))} onChange={value => set(["theme", "fonts", "codeSize"], Number(value))} />
    </SettingsSection>
    <SettingsSection title="Colors">
      <Text className="px-3 py-2 text-sm text-text-secondary">{"#RRGGBB, #RRGGBBAA, or system:<NSColor name> such as system:systemGreen."}</Text>
      <View className="flex-row justify-end px-3 py-2"><SegmentedControl accessibilityLabel="Appearance" options={[{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }]} value={appearance} onValueChange={value => setAppearance(value as Appearance)} /></View>
      <ColorRow title="Accent" path={[...base, "accent"]} value={tokens.accent} appearance={appearance} />
    </SettingsSection>
    <SettingsSection title="File Status">{group("status")}</SettingsSection>
    <SettingsSection title="Diff">{group("diff")}</SettingsSection>
    <SettingsSection title="Ref Labels">{group("refs")}</SettingsSection>
    <SettingsSection title="Graph Lanes">
      <Text className="px-3 py-2 text-sm text-text-secondary">In order; the last color is used for lanes past the maximum.</Text>
      <View style={styles.inline} className="justify-end px-3 py-2">
      <Button onPress={() => set([...base, "lanes"], [...lanes.slice(0, -1), lanes.at(-2) ?? "#007AFF", lanes.at(-1)!])}>Add Lane</Button>
      <Button onPress={() => set([...base, "lanes"], undefined)}>Reset</Button>
      </View>
      {lanes.map((value, index) => <ColorRow key={index} title={index === lanes.length - 1 ? "Overflow" : `Lane ${index + 1}`} path={[...base, "lanes"]} value={value} appearance={appearance}
        onRemove={lanes.length > 3 && index < lanes.length - 1 ? () => set([...base, "lanes"], lanes.filter((_, at) => at !== index)) : undefined} />)}
    </SettingsSection>
  </>;
}

// ── Toolbar and context menus (list editors) ─────────────────────────────────

type Item = { key: string; label: string; detail?: string };
const widgetTitles: Record<string, string> = { branchPicker: "Branch Picker", viewSwitcher: "Changes | History", search: "Search", networkProgress: "Network Progress", space: "Space", flexibleSpace: "Flexible Space", separator: "Separator" };
const commandTitle = (id: string) => (commandMeta as Record<string, CommandMeta>)[id]?.title ?? `Unknown command “${id}”`;

/** Available ↔ current lists. Rows drag between and within lists (reorder-controls) and have buttons for the keyboard. */
function ListEditor<Entry>({ zone, current, available, describe, onChange }: { zone: string; current: readonly Entry[]; available: readonly Entry[]; describe(entry: Entry): Item; onChange(next: Entry[]): void }) {
  const move = (from: number, to: number) => { const next = [...current]; const [entry] = next.splice(from, 1); next.splice(Math.max(0, Math.min(to, next.length)), 0, entry!); onChange(next); };
  const insert = (entry: Entry, at: number) => { const next = [...current]; next.splice(at, 0, entry); onChange(next); };
  type Drag = { from: "current"; index: number } | { from: "available"; entry: Entry };
  const dropAt = (at: number) => (item: { data: unknown }) => {
    const drag = item.data as Drag;
    if (drag.from === "current") move(drag.index, drag.index < at ? at - 1 : at);
    else insert(drag.entry, at);
  };
  return <DragDropProvider>
    <View style={styles.lists}>
      <View className="rounded-xl border border-border-primary bg-background-secondary flex-1 min-w-0 p-2">
        <Text style={styles.listTitle}>Available</Text>
        {available.map(entry => { const item = describe(entry); return <DraggableItem key={item.key} id={`${zone}-available-${item.key}`} zoneId={zone} dragOverlayMode="local" data={{ from: "available", entry } satisfies Drag}>
          <View style={styles.listRow}><Text style={styles.rowLabel} numberOfLines={1}>{item.label}</Text><Button variant="borderless" style={styles.rowButton} onPress={() => insert(entry, current.length)}>Add</Button></View>
        </DraggableItem>; })}
      </View>
      <View className="rounded-xl border border-border-primary bg-background-secondary flex-1 min-w-0 p-2">
        <Text style={styles.listTitle}>Current</Text>
        {current.map((entry, index) => { const item = describe(entry); return <DroppableZone key={`${index}-${item.key}`} allowDrop={() => true} onDrop={dropAt(index)}>
          <DraggableItem id={`${zone}-current-${index}-${item.key}`} zoneId={zone} dragOverlayMode="local" data={{ from: "current", index } satisfies Drag}>
            <View style={styles.listRow}>
              <Text style={styles.rowLabel} numberOfLines={1}>{item.label}</Text>
              <Button variant="borderless" style={styles.rowButton} disabled={index === 0} onPress={() => move(index, index - 1)}>Up</Button>
              <Button variant="borderless" style={styles.rowButton} disabled={index === current.length - 1} onPress={() => move(index, index + 1)}>Down</Button>
              <Button variant="borderless" style={styles.rowButtonWide} onPress={() => onChange(current.filter((_, at) => at !== index))}>Remove</Button>
            </View>
          </DraggableItem>
        </DroppableZone>; })}
        <DroppableZone allowDrop={() => true} onDrop={dropAt(current.length)}><View style={styles.dropEnd}><Text style={styles.secondary}>Drop here to add at the end</Text></View></DroppableZone>
      </View>
    </View>
  </DragDropProvider>;
}

type ToolbarEntry = GitSettings["toolbar"]["items"][number];
const toolbarKey = (entry: ToolbarEntry) => typeof entry === "string" ? entry : `${entry.command}:${entry.label ?? ""}`;

function ToolbarPage() {
  const { settings, set } = usePane();
  const { items, displayMode } = settings.toolbar;
  const available: ToolbarEntry[] = [...toolbarWidgets, ...commandIds.filter(id => (commandMeta[id] as CommandMeta).symbol)];
  return <>
    <SettingsSection title="Toolbar">
      <View className="flex-row justify-end px-3 py-2"><Button onPress={() => set(["toolbar", "items"], undefined)}>Reset to Preset</Button></View>
      <Choice title="Display" description="Spark's toolbar shows icons only for now (ask S2); labels show in tooltips." value={displayMode} options={[{ label: "Icon and Label", value: "iconAndLabel" }, { label: "Icon Only", value: "iconOnly" }, { label: "Label Only", value: "labelOnly" }]} onChange={value => set(["toolbar", "displayMode"], value)} />
    </SettingsSection>
    <SettingsSection title="Items">
      <ListEditor<ToolbarEntry> zone="toolbar" current={items} available={available} onChange={next => set(["toolbar", "items"], next)}
        describe={entry => typeof entry === "string" ? { key: entry, label: widgetTitles[entry] ?? commandTitle(entry) } : { key: toolbarKey(entry), label: entry.label ?? commandTitle(entry.command) }} />
    </SettingsSection>
  </>;
}

function MenusPage() {
  const { settings, set } = usePane();
  const [target, setTarget] = useState<MenuTarget>("commit");
  const current = settings.contextMenus[target] ?? defaultContextMenus[target];
  const available: MenuEntry[] = ["separator", ...commandIds.filter(id => (commandMeta[id] as CommandMeta).targets?.includes(target))];
  return <>
    <SettingsSection title="Context Menus">
      <View className="flex-row justify-end px-3 py-2"><Button onPress={() => set(["contextMenus", target], undefined)}>Reset Menu</Button></View>
      <Choice title="Menu" description="Entries that don't apply to what was clicked are left out when the menu opens." value={target} options={menuTargets.map(id => ({ label: titleCase(id), value: id }))} onChange={value => setTarget(value as MenuTarget)} />
    </SettingsSection>
    <SettingsSection title="Items">
      <ListEditor<MenuEntry> zone={`menu-${target}`} current={current} available={available} onChange={next => set(["contextMenus", target], next)}
        describe={entry => typeof entry === "string" ? { key: entry, label: entry === "separator" ? "── Separator ──" : commandTitle(entry) } : { key: `submenu:${entry.submenu}`, label: `${entry.submenu} ▸ (${entry.items.length})` }} />
    </SettingsSection>
  </>;
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

const parseable = (binding: string) => {
  try { (require("@legendapp/spark/shortcuts/commands") as typeof import("@legendapp/spark/shortcuts/commands")).normalizeHotkeyBindings([binding]); return true; } catch { return false; }
};
let definitionCache: { id: CommandId; title: string; description: string; defaultBindings: readonly string[] }[] | null = null;
const hotkeyDefinitions = () => definitionCache ??= commandIds.map(id => {
  const shortcut = defaultShortcut(id);
  return { id, title: commandMeta[id].title, description: commandMeta[id].description, defaultBindings: shortcut && parseable(shortcut) ? [shortcut] : [] };
});

function KeyboardPage() {
  const { settings, set } = usePane();
  const { HotkeyBindingsSettingsContent } = require("@legendapp/spark/shortcuts/commands") as typeof import("@legendapp/spark/shortcuts/commands");
  const definitions = hotkeyDefinitions();
  const values = Object.fromEntries(definitions.map(definition => [definition.id, (settings.keybindings[definition.id] ?? definition.defaultBindings) as readonly string[]])) as Record<CommandId, readonly string[]>;
  const conflicts = resolveKeyBindings(settings.keybindings).issues;
  return <View>
    {conflicts.length ? <Text style={styles.warning}>{conflicts.map(issue => issue.message).join("\n")}</Text> : null}
    <HotkeyBindingsSettingsContent<CommandId> definitions={definitions} values={values} showTitle={false}
      onChange={(id, next) => set(["keybindings", id], deepEqual([...next], [...definitions.find(definition => definition.id === id)!.defaultBindings]) ? undefined : [...next])}
      onResetAll={() => set(["keybindings"], undefined)} />
  </View>;
}

// ── Customize with AI ────────────────────────────────────────────────────────

/** `fill` remounts the request field when an example replaces its text. */
const aiState$ = observable<{ request: string; fill: number; running: boolean; status: string; patch: Record<string, unknown> | null }>({ request: "", fill: 0, running: false, status: "", patch: null });

async function runAI(pane: Pane) {
  const { store, scope, settings, root } = pane;
  const ai = require("@legendapp/spark/ai") as typeof import("@legendapp/spark/ai");
  const { runCommitMessageAI } = require("../commitMessageAI") as typeof import("../commitMessageAI");
  const tool = ai.selectPreferredAITool(await ai.getAICommandAvailability());
  if (!tool) throw new Error("Install the Claude or Codex command-line tool and sign in to customize with AI.");
  const files = require("@legendapp/spark/files") as typeof import("@legendapp/spark/files");
  const cwd = root ?? await files.getDirectory("data");
  const controller = new AbortController();
  let attempt = 0;
  const result = await generateSettingsPatch(
    { request: aiState$.request.peek(), aiReference: buildAIReferenceDoc(), schema: formatJsonSchema(buildSettingsJsonSchema()), effective: settings, scope },
    prompt => { attempt += 1; aiState$.status.set(attempt === 1 ? `Asking ${tool}…` : `Asking ${tool} to correct its reply…`); return runCommitMessageAI(prompt, tool, cwd, controller.signal); },
  );
  store.preview(scope, applyImport(store.layerFile(scope).file, result.patch, "onTop"));
  aiState$.assign({ patch: result.patch, status: `Previewing ${tool}’s settings${result.attempts > 1 ? " (corrected once)" : ""}.` });
}

function AIPage() {
  const pane = usePane();
  const { store, scope, windowId } = pane;
  const state = useValue(aiState$);
  const previewing = useValue(() => !!store.layers$[scope].get()?.previewing);
  useEffect(() => () => { if (store.layerFile(scope).previewing) store.preview(scope, null); }, [store, scope]);
  const generate = () => {
    aiState$.assign({ running: true, status: "Starting…", patch: null });
    runAI(pane).catch(error => aiState$.status.set(error instanceof Error ? error.message : String(error))).finally(() => aiState$.running.set(false));
  };
  return <>
    <SettingsSection title="Customize with AI">
      <Text className="px-3 py-2 text-sm text-text-secondary">Describe the change. Your own Claude or Codex command-line tool writes a settings patch from Legend Git's settings reference; you see it live before anything is saved. This changes settings only; Customize App changes the app's code.</Text>
      <SettingsRow label="Request">
        <TextInput key={state.fill} accessibilityLabel="Request" defaultValue={state.request} onChangeText={text => aiState$.request.set(text)} style={styles.prompt} />
      </SettingsRow>
      <Choice title="Examples" value="" options={[{ label: "Choose an Example…", value: "" }, ...examplePrompts.map(prompt => ({ label: prompt, value: prompt }))]} onChange={value => { if (value) aiState$.assign({ request: value, fill: aiState$.fill.peek() + 1 }); }} />
      <SettingsRow label={state.running ? "Working…" : "Generate"} description={state.status || undefined}>
        <Button disabled={state.running || previewing || !state.request.trim()} onPress={generate}>Generate</Button>
      </SettingsRow>
    </SettingsSection>
    {previewing ? <SettingsSection title="AI settings preview">
      <Text className="px-3 py-2 text-sm text-text-secondary">The window shows these settings now; nothing is saved until you keep them.</Text>
      <View style={styles.inline}>
        <Button onPress={() => { store.replace(scope, store.layerFile(scope).file!).then(() => aiState$.assign({ patch: null, status: "Kept." }), report(windowId, "Couldn’t Save the Settings")); }}>Keep</Button>
        <Button onPress={() => { store.preview(scope, null); aiState$.assign({ patch: null, status: "Reverted." }); }}>Revert</Button>
        <Button onPress={() => { void dialogs().showMessage({ windowId, title: "AI Settings Changes", message: JSON.stringify(state.patch, null, 2) }).catch(console.error); }}>Show Changes</Button>
      </View>
    </SettingsSection> : null}
  </>;
}

// ── Window ───────────────────────────────────────────────────────────────────

export const settingsWindowId = "git-settings"; // gitWindows registers the window under this id

/** Settings ▸ for the repository of the window it was opened from; it shares that window's settings store. */
export function GitSettingsWindow() {
  const target = useValue(settingsTarget$);
  const [opened, setOpened] = useState<{ root: string | null; store: GitSettingsStore } | null>(null);
  const [scope, setScope] = useState<LayerId>("user");
  useEffect(() => {
    let disposed = false;
    const shared = acquireGitSettings(target.root);
    shared.store.then(async next => { await next.ready; if (!disposed) setOpened({ root: target.root, store: next }); }).catch(console.error);
    setScope("user");
    return () => { disposed = true; shared.release(); };
  }, [target.root]);
  // Until the new repository's store is open, the previous one (without that repository's layer) is not shown.
  const store = opened && opened.root === target.root ? opened.store : null;
  const settings = useValue(() => store?.settings$.get() ?? null);
  const pane = useMemo<Pane | null>(() => store && settings ? {
    store, settings, root: target.root, scope, setScope, windowId: settingsWindowId,
    set: (path, value) => { store.edit(scope, path, value).catch(report(settingsWindowId, "Couldn’t Change the Setting")); },
  } : null, [store, settings, scope, target.root]);
  return <PaneContext.Provider value={pane}>
    <VirtualizedSettingsWindow<SettingsPageId> windowId={settingsWindowId} appearance={settings?.appearance ?? "system"} selectedPageId={target.page} onSelectionChange={page => settingsTarget$.page.set(page)} >
      <SettingsPage id="general" title="General" icon="gearshape">
        {pane ? <GeneralPage /> : null}
      </SettingsPage>
      <SettingsPage id="layout" title="Layout" icon="rectangle.split.2x1">
        {pane ? <LayoutPage /> : null}
      </SettingsPage>
      <SettingsPage id="panels" title="Panels" icon="sidebar.left">
        {pane ? <PanelsPage /> : null}
      </SettingsPage>
      <SettingsPage id="theme" title="Theme" icon="paintbrush">
        {pane ? <ThemePage /> : null}
      </SettingsPage>
      <SettingsPage id="toolbar" title="Toolbar" icon="rectangle.topthird.inset.filled">
        {pane ? <ToolbarPage /> : null}
      </SettingsPage>
      <SettingsPage id="menus" title="Context Menus" icon="list.bullet">
        {pane ? <MenusPage /> : null}
      </SettingsPage>
      <SettingsPage id="keyboard" title="Keyboard" icon="keyboard">
        {pane ? <KeyboardPage /> : null}
      </SettingsPage>
      <SettingsPage id="ai" title="Customize with AI" icon="sparkles">
        {pane ? <AIPage /> : null}
      </SettingsPage>
    </VirtualizedSettingsWindow>
  </PaneContext.Provider>;
}

const label = PlatformColor("labelColor"), secondary = PlatformColor("secondaryLabelColor"), separator = PlatformColor("separatorColor");
const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  select: { minWidth: 180 },
  secondary: { fontSize: 11, color: secondary },
  warning: { marginTop: 12, fontSize: 12, color: PlatformColor("systemOrangeColor") },
  warningText: { color: PlatformColor("systemOrangeColor") },
  error: { color: PlatformColor("systemRedColor") },
  schematic: { height: 160, padding: 8 },
  split: { flex: 1, gap: 3 },
  box: { flex: 1, borderWidth: 1, borderColor: separator, borderRadius: 4, alignItems: "center", justifyContent: "center", padding: 2 },
  boxLabel: { fontSize: 11, color: secondary },
  swatch: { width: 22, height: 22, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: separator },
  colorField: { width: 190 },
  prompt: { width: 320 },
  lists: { flexDirection: "row", gap: 12 },
  listTitle: { fontSize: 12, fontWeight: "600", color: secondary, marginBottom: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 26 },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 13, color: label },
  rowButton: { width: 48, flexShrink: 0 },
  rowButtonWide: { width: 68, flexShrink: 0 },
  dropEnd: { minHeight: 28, alignItems: "center", justifyContent: "center" },
});
