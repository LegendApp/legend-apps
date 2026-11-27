import type { MarkdownFormattingToolbarModeSetting } from "./markdownSettings";

/**
 * Declarative Markdown plugins, version 1. A manifest contributes namespaced commands and writing rules;
 * the app runs them with host code, so installing a plugin never executes plugin JavaScript.
 * The format is documented in apps/markdown/docs/plugins.md.
 */
export type MarkdownPluginRule = {
  id: string;
  title: string;
  find: string;
  replace: string;
  enabled: boolean;
};

export type MarkdownPluginCommand = {
  id: string;
  title: string;
  icon?: string;
  kind: "checkDocument";
};

export type MarkdownPluginManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  commands: MarkdownPluginCommand[];
  rules: MarkdownPluginRule[];
};

export type MarkdownRuleOverride = { enabled?: boolean; replace?: string };

export type MarkdownPreset = {
  schemaVersion: 1;
  formattingToolbarMode?: MarkdownFormattingToolbarModeSetting;
  toolbar?: { top?: string[] };
  rules?: Record<string, MarkdownRuleOverride>;
};

export type MarkdownSuggestion = {
  blockId: string;
  before: string;
  after: string;
  commandId: string;
  find: string;
  replace: string;
};

const idPattern = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const toolbarModes: readonly string[] = ["selection", "top", "bottom", "hidden"];

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail(`${path} must be an object`);
}

function text(value: unknown, path: string): string {
  return typeof value === "string" && value.trim() ? value : fail(`${path} must be a non-empty string`);
}

function list(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : fail(`${path} must be an array`);
}

function schemaVersion(json: Record<string, unknown>) {
  if (json.schemaVersion !== 1) fail(`schemaVersion ${String(json.schemaVersion)} is not supported; expected 1`);
}

/** IDs are lowercase and dotted, and contributions are namespaced under the plugin ID. */
function namespacedId(value: unknown, pluginId: string, path: string, seen: Set<string>): string {
  const id = text(value, path);
  if (!idPattern.test(id) || !id.startsWith(`${pluginId}.`)) fail(`${path} "${id}" must start with "${pluginId}."`);
  if (seen.has(id)) fail(`${path} "${id}" is declared twice`);
  seen.add(id);
  return id;
}

export function parseMarkdownPluginManifest(source: string): MarkdownPluginManifest {
  const json = record(JSON.parse(source), "manifest");
  schemaVersion(json);
  const id = text(json.id, "id");
  if (!idPattern.test(id)) fail(`id "${id}" must be lowercase and dotted, like "com.example.house-style"`);
  const seen = new Set<string>();
  const commands = list(json.commands, "commands").map((value, index): MarkdownPluginCommand => {
    const command = record(value, `commands[${index}]`);
    if (command.kind !== "checkDocument") fail(`commands[${index}].kind must be "checkDocument"`);
    return {
      id: namespacedId(command.id, id, `commands[${index}].id`, seen),
      title: text(command.title, `commands[${index}].title`),
      ...(command.icon === undefined ? {} : { icon: text(command.icon, `commands[${index}].icon`) }),
      kind: "checkDocument",
    };
  });
  const rules = list(json.rules, "rules").map((value, index): MarkdownPluginRule => {
    const rule = record(value, `rules[${index}]`);
    return {
      id: namespacedId(rule.id, id, `rules[${index}].id`, seen),
      title: text(rule.title, `rules[${index}].title`),
      find: text(rule.find, `rules[${index}].find`),
      replace: text(rule.replace, `rules[${index}].replace`),
      enabled: rule.enabled !== false,
    };
  });
  return { schemaVersion: 1, id, name: text(json.name, "name"), version: text(json.version, "version"), commands, rules };
}

/** Validates a preset against the installed manifests. Importing a preset never installs or enables plugins. */
export function parseMarkdownPreset(source: string, manifests: readonly MarkdownPluginManifest[]): MarkdownPreset {
  const json = record(JSON.parse(source), "preset");
  schemaVersion(json);
  const commandIds = new Set(manifests.flatMap((manifest) => manifest.commands.map((command) => command.id)));
  const ruleIds = new Set(manifests.flatMap((manifest) => manifest.rules.map((rule) => rule.id)));
  const preset: MarkdownPreset = { schemaVersion: 1 };

  if (json.formattingToolbarMode !== undefined) {
    const mode = json.formattingToolbarMode;
    if (typeof mode !== "string" || !toolbarModes.includes(mode)) fail(`formattingToolbarMode must be one of ${toolbarModes.join(", ")}`);
    preset.formattingToolbarMode = mode as MarkdownFormattingToolbarModeSetting;
  }

  if (json.toolbar !== undefined) {
    const top = list(record(json.toolbar, "toolbar").top ?? [], "toolbar.top").map((value, index) => {
      const id = text(value, `toolbar.top[${index}]`);
      return commandIds.has(id) ? id : fail(`toolbar.top[${index}] "${id}" is not a command of an installed plugin`);
    });
    if (new Set(top).size !== top.length) fail("toolbar.top lists a command twice");
    preset.toolbar = { top };
  }

  if (json.rules !== undefined) {
    preset.rules = Object.fromEntries(Object.entries(record(json.rules, "rules")).map(([id, value]) => {
      if (!ruleIds.has(id)) fail(`rules "${id}" is not a rule of an installed plugin`);
      const override = record(value, `rules["${id}"]`);
      for (const key of Object.keys(override)) {
        if (key !== "enabled" && key !== "replace") fail(`rules["${id}"].${key} is not a supported option`);
      }
      if (override.enabled !== undefined && typeof override.enabled !== "boolean") fail(`rules["${id}"].enabled must be a boolean`);
      return [id, {
        ...(override.enabled === undefined ? {} : { enabled: override.enabled as boolean }),
        ...(override.replace === undefined ? {} : { replace: text(override.replace, `rules["${id}"].replace`) }),
      }];
    }));
  }

  return preset;
}

export function resolveMarkdownPluginRules(
  manifest: MarkdownPluginManifest,
  overrides: Record<string, MarkdownRuleOverride>,
): MarkdownPluginRule[] {
  return manifest.rules
    .map((rule) => ({ ...rule, ...overrides[rule.id] }))
    .filter((rule) => rule.enabled);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns the first whole-word match of an enabled rule, with the block's markdown before and after the fix. */
export function findMarkdownSuggestion(
  blocks: readonly { id: string; markdown: string }[],
  rules: readonly MarkdownPluginRule[],
  commandId: string,
): MarkdownSuggestion | undefined {
  for (const block of blocks) {
    for (const rule of rules) {
      const match = new RegExp(`\\b${escapeRegExp(rule.find)}\\b`).exec(block.markdown);
      if (match) {
        const after = block.markdown.slice(0, match.index) + rule.replace + block.markdown.slice(match.index + rule.find.length);
        return { blockId: block.id, before: block.markdown, after, commandId, find: rule.find, replace: rule.replace };
      }
    }
  }
  return undefined;
}
