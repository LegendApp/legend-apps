import { readFileSync } from "fs";
import { join } from "path";
import {
  findMarkdownSuggestion,
  parseMarkdownPluginManifest,
  parseMarkdownPreset,
  resolveMarkdownPluginRules,
} from "../markdownPlugins";
import {
  applyMarkdownPreset,
  getMarkdownFormattingToolbarModeSetting,
  getMarkdownInstalledPlugins,
  getMarkdownPluginCommand,
  getMarkdownToolbarLayoutSetting,
  installMarkdownPlugin,
  setMarkdownPluginEnabled,
} from "../markdownSettings";
import { getDefaultMarkdownToolbarLayout } from "../markdownToolbarLayout";

jest.mock("@legend-apps/storage", () => ({
  createObservableFile: ({ initialValue }: { initialValue: unknown }) => jest.requireActual("@legendapp/state").observable(initialValue),
}));

const example = (name: string) => readFileSync(join(__dirname, "../../examples/house-style", name), "utf8");
const manifestSource = example("markdown-plugin.json");
const presetSource = example("markdown-preset.json");
const commandId = "com.example.house-style.check-document";
const ruleId = "com.example.house-style.sign-in";

function manifestWith(change: (json: any) => void) {
  const json = JSON.parse(manifestSource);
  change(json);
  return JSON.stringify(json);
}

describe("markdown plugin manifests and presets", () => {
  it("parses the example plugin and preset", () => {
    const manifest = parseMarkdownPluginManifest(manifestSource);
    expect(manifest.commands.map((command) => command.id)).toEqual([commandId]);
    expect(manifest.rules).toEqual([expect.objectContaining({ id: ruleId, enabled: false })]);
    expect(parseMarkdownPreset(presetSource, [manifest])).toEqual({
      schemaVersion: 1,
      formattingToolbarMode: "top",
      toolbar: { top: [commandId] },
      rules: { [ruleId]: { enabled: true } },
    });
  });

  it.each([
    ["an unsupported schema version", (json: any) => { json.schemaVersion = 2; }, /schemaVersion 2/],
    ["an unnamespaced rule", (json: any) => { json.rules[0].id = "sign-in"; }, /must start with "com.example.house-style."/],
    ["a duplicate ID", (json: any) => { json.rules[0].id = commandId; }, /declared twice/],
    ["an unsupported command kind", (json: any) => { json.commands[0].kind = "script"; }, /kind must be "checkDocument"/],
  ])("rejects a manifest with %s", (_name, change, message) => {
    expect(() => parseMarkdownPluginManifest(manifestWith(change))).toThrow(message);
  });

  it("rejects presets that reference anything an installed plugin does not declare", () => {
    const manifest = parseMarkdownPluginManifest(manifestSource);
    expect(() => parseMarkdownPreset(presetSource, [])).toThrow(/not a command of an installed plugin/);
    expect(() => parseMarkdownPreset(JSON.stringify({ schemaVersion: 1, rules: { "com.example.other.rule": {} } }), [manifest]))
      .toThrow(/not a rule of an installed plugin/);
    expect(() => parseMarkdownPreset(JSON.stringify({ schemaVersion: 1, rules: { [ruleId]: { find: "x" } } }), [manifest]))
      .toThrow(/find is not a supported option/);
  });

  it("suggests the first whole-word match of enabled rules only", () => {
    const manifest = parseMarkdownPluginManifest(manifestSource);
    const blocks = [{ id: "b0", markdown: "A blog in the log." }, { id: "b1", markdown: "Please log in to continue." }];
    expect(findMarkdownSuggestion(blocks, resolveMarkdownPluginRules(manifest, {}), commandId)).toBeUndefined();
    expect(findMarkdownSuggestion(blocks, resolveMarkdownPluginRules(manifest, { [ruleId]: { enabled: true } }), commandId)).toEqual({
      blockId: "b1",
      before: "Please log in to continue.",
      after: "Please sign in to continue.",
      commandId,
      find: "log in",
      replace: "sign in",
    });
  });
});

describe("markdown plugin settings", () => {
  it("installs, configures through a preset and disables a plugin without touching built-in settings", () => {
    expect(getMarkdownInstalledPlugins()).toEqual([]);
    expect(getMarkdownPluginCommand(commandId)).toBeUndefined();
    expect(getMarkdownFormattingToolbarModeSetting()).toBe("selection");

    const manifest = parseMarkdownPluginManifest(manifestSource);
    installMarkdownPlugin(manifest);
    expect(getMarkdownPluginCommand(commandId)?.rules).toEqual([]);

    applyMarkdownPreset(parseMarkdownPreset(presetSource, [manifest]));
    expect(getMarkdownFormattingToolbarModeSetting()).toBe("top");
    expect(getMarkdownPluginCommand(commandId)?.rules).toEqual([expect.objectContaining({ id: ruleId, enabled: true })]);
    expect(getMarkdownToolbarLayoutSetting("top")).toEqual(getDefaultMarkdownToolbarLayout("top"));

    setMarkdownPluginEnabled(manifest.id, false);
    expect(getMarkdownPluginCommand(commandId)).toBeUndefined();
  });
});
