#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

/** Logical regular-file bytes; framework symlinks must not count their targets twice. */
export function appSizes(app: string) {
  const components = { executable: 0, jsBundle: 0, frameworks: 0, assets: 0, helpers: 0, metadata: 0 };
  function visit(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        const relative = path.relative(app, file).split(path.sep).join("/");
        const category = relative.startsWith("Contents/MacOS/") ? "executable"
          : relative.startsWith("Contents/Helpers/") ? "helpers"
          : relative.startsWith("Contents/Frameworks/") || /\.dylib$/.test(relative) ? "frameworks"
          : /\.(jsbundle|hbc)$/.test(relative) ? "jsBundle"
          : relative.startsWith("Contents/Resources/") && !/(_CodeSignature\/|\.plist$)/.test(relative) ? "assets"
          : "metadata";
        components[category] += fs.statSync(file).size;
      }
    }
  }
  visit(app);
  return { logicalBytes: Object.values(components).reduce((sum, bytes) => sum + bytes, 0), components };
}

/** Linked symbol bytes are attribution, not disk size; dead-stripped symbols are excluded. */
export function linkMapSummary(source: string) {
  const objects = new Map<number, string>();
  const contributions = new Map<string, number>();
  const symbols: { bytes: number; name: string; object: string }[] = [];
  let section = "";
  for (const line of source.split("\n")) {
    if (line.startsWith("#")) {
      if (/^# (Object files|Sections|Symbols|Dead Stripped Symbols):/.test(line)) section = line;
      continue;
    }
    if (section === "# Object files:") {
      const match = line.match(/^\[\s*(\d+)\]\s+(.+)$/);
      if (match) objects.set(Number(match[1]), match[2]!);
    } else if (section === "# Symbols:") {
      const match = line.match(/^0x[\da-f]+\s+0x([\da-f]+)\s+\[\s*(\d+)\]\s+(.+)$/i);
      if (!match) continue;
      const bytes = parseInt(match[1]!, 16);
      const object = objects.get(Number(match[2])) ?? "unknown";
      const library = path.basename(object.split("(")[0]!).replace(/\[\d+\]$/, "");
      contributions.set(library, (contributions.get(library) ?? 0) + bytes);
      symbols.push({ bytes, name: match[3]!, object: path.basename(object) });
    }
  }
  if (!symbols.length) throw new Error("No live symbols found in linker map.");
  return {
    linkedSymbolBytes: symbols.reduce((sum, symbol) => sum + symbol.bytes, 0),
    largestSymbols: symbols.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
    libraries: [...contributions].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes),
  };
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    zip: { type: "string" }, "budget-mb": { type: "string", default: "25" },
    compiler: { type: "string" }, "compiler-budget-mb": { type: "string", default: "12" },
    "link-map": { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("Usage: bun scripts/slides-size-budget.ts <app> --zip <output.zip> [--budget-mb 25] [--compiler <compiler.zip>] [--compiler-budget-mb 12] [--link-map <map>]\nWrites a notarization-style ditto ZIP and prints JSON. Budgets use decimal MB; exits 1 when exceeded. Does not sign, notarize or publish.");
  } else {
    if (positionals.length !== 1 || !values.zip) throw new Error("Supply one .app and --zip output (see --help).");
    const app = path.resolve(positionals[0]!);
    const zip = path.resolve(values.zip);
    if (!app.endsWith(".app") || !fs.existsSync(path.join(app, "Contents/Info.plist"))) throw new Error("Expected a macOS .app.");
    if (zip === app || zip.startsWith(app + path.sep)) throw new Error("ZIP output must be outside the app.");
    function budget(value: string) {
      const bytes = Number(value) * 1_000_000;
      if (!Number.isFinite(bytes) || bytes <= 0) throw new Error("Budget must be a positive MB value.");
      return bytes;
    }
    const budgetBytes = budget(values["budget-mb"]!);
    const compilerBudgetBytes = budget(values["compiler-budget-mb"]!);
    if (fs.existsSync(zip)) throw new Error("ZIP output already exists; choose a new path.");
    const result = spawnSync("/usr/bin/ditto", ["-c", "-k", "-rsrc", "--sequesterRsrc", "--keepParent", "--zlibCompressionLevel", "9", app, zip], { encoding: "utf8" });
    if (result.error || result.status !== 0) throw new Error(`ditto failed: ${result.error?.message ?? result.stderr}`);
    const zipBytes = fs.statSync(zip).size;
    const compiler = values.compiler ? { zipBytes: fs.statSync(path.resolve(values.compiler)).size, budgetBytes: compilerBudgetBytes } : undefined;
    const passed = zipBytes <= budgetBytes && (!compiler || compiler.zipBytes <= compiler.budgetBytes);
    console.log(JSON.stringify({ app, ...appSizes(app), zipBytes, budgetBytes, compiler, passed,
      linkMap: values["link-map"] ? linkMapSummary(fs.readFileSync(values["link-map"], "utf8")) : undefined }, null, 2));
    if (!passed) process.exitCode = 1;
  }
}
