import { commandCategories, commandIds, commandMeta, type CommandMeta } from "../commandMeta";
import { defaultShortcut } from "../commands";
import { historyQueryQualifiers } from "../historyQuery";
import { buildSettingsJsonSchema } from "./jsonSchema";
import { panelIds, presetIds, settingsVersion, switchConditions, toolbarWidgets, viewKinds } from "./schema";
import { isPlainObject } from "./validate";
import compact from "../../docs/settings/examples/compact.json";
import diffBelow from "../../docs/settings/examples/diff-below-commit-list.json";
import forkSideBySide from "../../docs/settings/examples/fork-side-by-side.json";
import commitMenu from "../../docs/settings/examples/commit-menu-and-toolbar.json";
import stageKeys from "../../docs/settings/examples/stage-keys.json";

/**
 * The generated settings docs (spec §9): `docs/settings/reference.md`, `commands.md` and `ai-reference.md`. A Jest test
 * fails when the checked-in files differ (`GIT_SETTINGS_WRITE_DOCS=1 bun run test:git -t "settings docs"` rewrites
 * them). The app builds the AI reference from the same functions, so Customize with AI always matches the running app.
 */

type Schema = Record<string, unknown> & { properties?: Record<string, Schema>; enum?: string[]; description?: string };

const generatedNote = "<!-- Generated from apps/git/src/settings (schema.ts, commandMeta.ts); do not edit. -->";
const code = (value: unknown) => `\`${JSON.stringify(value)}\``;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

function typeOf(node: Schema): string {
  if (node.enum) return node.enum.map(value => code(value)).join(" \\| ");
  if (node.$ref) return String(node.$ref).replace("#/$defs/", "");
  if (node.anyOf) return (node.anyOf as Schema[]).map(typeOf).join(" or ");
  if (node.type === "array") return `array of ${typeOf((node.items ?? {}) as Schema)}`;
  if (node.type === "number" || node.type === "integer") {
    const range = node.minimum !== undefined || node.maximum !== undefined ? ` ${node.minimum ?? ""}–${node.maximum ?? ""}` : "";
    return `${node.type}${range}`;
  }
  if (node.type === "object" && node.additionalProperties && isPlainObject(node.additionalProperties)) return `map of ${typeOf(node.additionalProperties as Schema)}`;
  return String(node.type ?? "any");
}

function meanings(node: Schema) {
  const table = node["x-enumDescriptions"] as Record<string, string> | undefined;
  return table ? Object.entries(table).map(([value, meaning]) => `${code(value)} ${meaning}`).join("<br>") : "";
}

function presetCells(node: Schema) {
  const values = node["x-preset-values"] as Record<string, unknown> | undefined;
  return presetIds.map(id => values && values[id] !== undefined ? code(values[id]) : "").join(" | ");
}

/** One table per object, nested objects after their parent, `##` per top-level key. */
function objectTables(node: Schema, path: string, out: string[], depth: number) {
  const entries = Object.entries(node.properties ?? {});
  const leaves = entries.filter(([, child]) => !child.properties);
  if (leaves.length) {
    out.push(`| Key | Type | Default | SourceTree \\| Fork \\| GitKraken | Meaning |`, `|---|---|---|---|---|`);
    for (const [key, child] of leaves) {
      const meaning = [child.description ?? "", meanings(child)].filter(Boolean).join("<br>");
      out.push(`| \`${path ? `${path}.` : ""}${key}\` | ${cell(typeOf(child))} | ${child.default !== undefined ? code(child.default) : ""} | ${presetCells(child)} | ${cell(meaning)} |`);
    }
    out.push("");
  }
  for (const [key, child] of entries.filter(([, value]) => value.properties)) {
    const childPath = path ? `${path}.${key}` : key;
    out.push(`${"#".repeat(Math.min(depth + 1, 4))} \`${childPath}\``, "", child.description ?? "", "");
    objectTables(child, childPath, out, depth + 1);
  }
}

const layoutRules = [
  "A layout has a `views` object with a required `default` tree and optional trees per view kind: " + viewKinds.map(kind => `\`${kind}\``).join(", ") + ". A missing or null kind uses `default`.",
  "A tree is made of three node types:",
  "- `{ \"type\": \"split\", \"direction\": \"row\" | \"column\", \"children\": [ { \"node\": <node>, \"size\"?, \"minSize\"?, \"maxSize\"?, \"collapsible\"?, \"holdingPriority\"? }, … ] }` with 2 to 4 children. `row` puts children side by side, `column` stacks them.",
  "- `{ \"type\": \"panel\", \"panel\": <panel id>, \"id\"?, \"options\"? }`. Panel ids: " + panelIds.map(id => `\`${id}\``).join(", ") + ". `options` overrides `panels.<panel>` for this pane only.",
  "- `{ \"type\": \"switch\", \"cases\": [ { \"when\": <condition>, \"node\": <node> } ], \"otherwise\": <node> }`. Conditions: " + switchConditions.map(id => `\`${id}\``).join(", ") + ".",
  "Rules checked on load (a view that breaks one falls back to the base preset's view, with an issue naming the node path):",
  "- every view reaches a `diff` panel;",
  "- a panel appears once per view unless each copy has its own `id` (different branches of a switch may repeat one);",
  "- the panes' minimum sizes (default 120 pt each) fit a 960 × 542 pt content area;",
  "- `options` validate against that panel's options.",
];

export function buildReferenceDoc() {
  const schema = buildSettingsJsonSchema() as Schema;
  const out = [
    "# Legend Git settings reference", "", generatedNote, "",
    `Settings files are JSON with \`"version": ${settingsVersion}\`. Every key is optional; an omitted key inherits from the layer below (built-in defaults < preset < user < repository). Objects merge key by key; arrays and layout nodes replace whole. The JSON Schema is \`apps/git/settings/git-settings.v${settingsVersion}.schema.json\`; check a file with \`bun run git:settings check <file>\`. Preset columns show what each preset sets.`, "",
    "## File keys", "",
  ];
  const fileKeys = ["$schema", "version", "name", "description", "author", "root", "extends"];
  out.push("| Key | Type | Meaning |", "|---|---|---|");
  for (const key of fileKeys) {
    const node = schema.properties![key]!;
    out.push(`| \`${key}\` | ${cell(typeOf(node))} | ${cell([node.description ?? "", meanings(node)].filter(Boolean).join("<br>"))} |`);
  }
  out.push("");
  const settingsOnly: Schema = { properties: Object.fromEntries(Object.entries(schema.properties!).filter(([key]) => !fileKeys.includes(key))) };
  out.push("## Settings", "");
  objectTables(settingsOnly, "", out, 2);
  out.push("## Layout rules", "", ...layoutRules, "");
  out.push("## Toolbar entries", "", `An entry is a command id (see [commands.md](commands.md)), \`{ "command": <id>, "label"?, "symbol"? }\`, or a widget: ${toolbarWidgets.map(id => `\`${id}\``).join(", ")}.`, "");
  out.push("## Context menu entries", "", "An entry is a command id, `\"separator\"`, or `{ \"submenu\": <title>, \"items\": [ … ] }`. Each target's list replaces the built-in menu whole; entries that don't apply to what was clicked are left out when the menu opens.", "");
  out.push("## History search", "", "The toolbar's search field (`search` widget) searches History. Free words match a commit's message, author, committer, SHA prefix or branch and tag names, and every word must match. Qualifiers narrow one field; a qualifier's values match either one (`author:ann author:bob`), `-` in front leaves matches out (`-author:bot`, `-wip`), and quotes keep spaces (`author:\"Jay M\"`).", "",
    "| Qualifier | Matches |", "|---|---|", ...historyQueryQualifiers.map(([example, meaning]) => `| \`${example}\` | ${cell(meaning)} |`), "");
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

const shortcutText = (id: (typeof commandIds)[number]) => defaultShortcut(id) ?? "";

export function buildCommandsDoc() {
  const out = [
    "# Legend Git commands", "", generatedNote, "",
    "Settings files name commands by id in `toolbar.items`, `contextMenus` and `keybindings`. Ids are stable; a renamed command keeps its old id as an alias. Context menu targets list where a command may appear; commands without targets belong to the menu bar and toolbar.", "",
  ];
  for (const category of commandCategories) {
    const ids = commandIds.filter(id => commandMeta[id].category === category);
    if (!ids.length) continue;
    out.push(`## ${category[0]!.toUpperCase()}${category.slice(1)}`, "", "| Id | Title | Default shortcut | Context menus | Description |", "|---|---|---|---|---|");
    for (const id of ids) {
      const meta = commandMeta[id] as CommandMeta;
      out.push(`| \`${id}\` | ${cell(meta.title)} | ${shortcutText(id)} | ${(meta.targets ?? []).join(", ")} | ${cell(meta.description)}${meta.aliases?.length ? ` Aliases: ${meta.aliases.join(", ")}.` : ""} |`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** Compact enums for the AI reference: every leaf path with its allowed values or type. */
function leafLines(node: Schema, path: string, out: string[]) {
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const childPath = path ? `${path}.${key}` : key;
    if (child.properties) leafLines(child, childPath, out);
    else out.push(`- \`${childPath}\`: ${typeOf(child)}${child.default !== undefined ? ` (default ${JSON.stringify(child.default)})` : ""}`);
  }
}

const aiExamples: { prompt: string; file: Record<string, unknown> }[] = [forkSideBySide, compact, commitMenu, stageKeys, diffBelow].map(file => {
  const { $schema: _schema, name: _name, description, ...rest } = file as Record<string, unknown>;
  return { prompt: String(description), file: rest };
});

export function buildAIReferenceDoc() {
  const schema = buildSettingsJsonSchema() as Schema;
  const leaves: string[] = [];
  const { $schema: _s, version: _v, name: _n, description: _d, author: _a, root: _r, ...settings } = schema.properties!;
  leafLines({ properties: settings }, "", leaves);
  return `${[
    "# Legend Git settings for AI agents", "", generatedNote, "",
    "## Rules an AI must follow", "",
    "1. Reply with exactly one JSON object and nothing else: no prose, no code fence.",
    `2. The object has \`"version": ${settingsVersion}\` and only the keys the request needs (the smallest patch). It is merged onto the user's settings.`,
    "3. Use only the keys, values, panel ids and command ids listed here. Never invent keys or command ids.",
    "4. Objects merge key by key, but arrays (toolbar items, columns, menu entries, lane colors, sidebar sections) and layout nodes replace whole: write the complete array or node.",
    "5. To start from another preset set `extends`: " + presetIds.map(id => `\`${id}\``).join(", ") + ". A preset's layout is active when `layout.active` names it.",
    "6. A new layout goes in `layout.layouts.<name>` with `layout.active` set to that name; give it a `changes` view when its `default` view lacks the staging panels.",
    "7. Colors are `#RRGGBB`, `#RRGGBBAA` or `system:<NSColor name>`. Key bindings use `Cmd`, `Ctrl`, `Alt`, `Shift` and a key, joined with `+` (`Cmd+Shift+L`, `Space`).",
    "8. There are no shell commands or scripts: toolbars and menus reference command ids only.", "",
    "## File shape", "",
    "Top-level keys: `version` (required), `extends`, `appearance`, `density`, `theme`, `layout`, `panels`, `sidebar`, `toolbar`, `contextMenus`, `keybindings`. Every leaf, with its type or allowed values:", "",
    ...leaves, "",
    "## Layout node grammar", "", ...layoutRules, "",
    "## Toolbar and menus", "",
    `Toolbar entries: a command id, \`{ "command": <id>, "label"?, "symbol"? }\`, or a widget (${toolbarWidgets.join(", ")}). Context menu targets: ${Object.keys((schema.properties!.contextMenus as Schema).properties ?? {}).join(", ")}; entries are command ids, \`"separator"\` or \`{ "submenu", "items" }\`.`, "",
    "## Command ids", "",
    ...commandIds.map(id => `- \`${id}\`: ${commandMeta[id].title}${(commandMeta[id] as CommandMeta).targets ? ` (menus: ${(commandMeta[id] as CommandMeta).targets!.join(", ")})` : ""}`), "",
    "## Worked examples", "",
    ...aiExamples.flatMap(({ prompt, file }) => [`Request: “${prompt}”`, "", "```json", JSON.stringify(file, null, 2), "```", ""]),
  ].join("\n").trimEnd()}\n`;
}

export const generatedDocs = { "reference.md": buildReferenceDoc, "commands.md": buildCommandsDoc, "ai-reference.md": buildAIReferenceDoc } as const;
