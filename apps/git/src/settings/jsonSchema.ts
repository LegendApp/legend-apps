import { z } from "zod";
import { defaultSettings } from "./defaults";
import { presetSettings } from "./presets";
import { gitSettingsFileSchema, presetIds, schemaUrl, settingsVersion } from "./schema";
import { isPlainObject } from "./validate";

type JsonSchema = Record<string, unknown> & { properties?: Record<string, JsonSchema> };

export const schemaFileName = `git-settings.v${settingsVersion}.schema.json`;

/**
 * The checked-in JSON Schema, generated from the zod definitions (spec D1). Every property gets its built-in `default`
 * where one exists; panel options also list each preset's value (`x-preset-values`) for the docs generator.
 */
export function buildSettingsJsonSchema(): JsonSchema {
  const generated = z.toJSONSchema(gitSettingsFileSchema, { target: "draft-2020-12" }) as JsonSchema;
  const presets = Object.fromEntries(presetIds.map(id => [id, presetSettings(id)]));
  const annotate = (node: JsonSchema, path: string[]) => {
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      const childPath = [...path, key];
      const fallback = childPath.reduce<unknown>((current, segment) => isPlainObject(current) ? current[segment] : undefined, defaultSettings);
      if (fallback !== undefined && !isPlainObject(fallback) && child.default === undefined) child.default = fallback;
      if (childPath[0] === "panels" && childPath.length >= 3 && !isPlainObject(fallback)) {
        child["x-preset-values"] = Object.fromEntries(presetIds.map(id => [id, childPath.reduce<unknown>((current, segment) => isPlainObject(current) ? current[segment] : undefined, presets[id])]));
      }
      annotate(child, childPath);
    }
  };
  annotate(generated, []);
  const { $schema, ...rest } = generated;
  return { $schema, $id: schemaUrl, ...rest, required: ["version"], properties: { ...rest.properties, version: { ...rest.properties!.version, const: settingsVersion } } };
}

export const formatJsonSchema = (schema: JsonSchema) => `${JSON.stringify(schema, null, 2)}\n`;
