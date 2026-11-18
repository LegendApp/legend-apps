#!/usr/bin/env bun
// Legend Git settings tools: `bun run git:settings check <file...>` validates settings files the way the app reads them;
// `bun run git:settings schema [--check]` writes (or checks) the generated JSON Schema.
import fs from "node:fs";
import path from "node:path";
import { buildSettingsJsonSchema, formatJsonSchema, schemaFileName } from "../src/settings/jsonSchema";
import { migrateSettings } from "../src/settings/migrations";
import { isPresetId, presetView } from "../src/settings/presets";
import { defaultPreset } from "../src/settings/schema";
import { jsonErrorMessage } from "../src/settings/store";
import { isPlainObject, validateSettingsFile, type SettingsIssue } from "../src/settings/validate";

const schemaPath = path.join(import.meta.dir, "..", "settings", schemaFileName);
const usage = "Usage: bun run git:settings check <file...> | schema [--check]";

function check(file: string): SettingsIssue[] {
  const text = fs.readFileSync(file, "utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (error) { return [{ file, path: "", level: "error", message: jsonErrorMessage(text, error) }]; }
  const migrated = isPlainObject(parsed) ? migrateSettings(parsed) : { file: parsed, error: undefined };
  if (migrated.error) return [{ file, path: "version", level: "error", message: migrated.error }];
  const base = isPlainObject(parsed) && isPresetId(parsed.extends) ? parsed.extends : defaultPreset;
  return validateSettingsFile(migrated.file, { file, fallbackView: kind => presetView(base, kind) }).issues;
}

const [command, ...args] = process.argv.slice(2);
if (command === "check" && args.length) {
  const issues = args.flatMap(check);
  for (const issue of issues) console.log(`${issue.file}: ${issue.level}: ${issue.path || "(file)"}: ${issue.message}`);
  const errors = issues.filter(issue => issue.level === "error").length;
  console.log(errors ? `${errors} error${errors === 1 ? "" : "s"}` : `OK (${args.length} file${args.length === 1 ? "" : "s"}, ${issues.length} note${issues.length === 1 ? "" : "s"})`);
  process.exit(errors ? 1 : 0);
} else if (command === "schema") {
  const text = formatJsonSchema(buildSettingsJsonSchema());
  if (args.includes("--check")) {
    const current = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf8") : "";
    if (current !== text) {
      console.error(`${schemaPath} is stale; run: bun run git:settings schema`);
      process.exit(1);
    }
    console.log(`${schemaPath} is current`);
  } else {
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, text);
    console.log(`wrote ${schemaPath}`);
  }
} else {
  console.error(usage);
  process.exit(2);
}
