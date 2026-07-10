#!/usr/bin/env bun
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./lib/apps";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core") as {
  transformSync: (source: string, options: Record<string, unknown>) => { code?: string | null } | null;
};
const reactCompilerModule = require("babel-plugin-react-compiler");
const reactCompiler = reactCompilerModule.default ?? reactCompilerModule;

const sourceRoots = [
  path.join(rootDir, "apps"),
  path.join(rootDir, "packages"),
];
const ignoredDirectories = new Set([
  ".build",
  "android",
  "build",
  "dist",
  "ios",
  "macos",
  "node_modules",
  "vendor",
]);

type VerifyResult = {
  compiled: boolean;
  filePath: string;
};

function isSourceTypeScriptFile(filePath: string) {
  const baseName = path.basename(filePath);
  return (
    (filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
    && filePath.includes(`${path.sep}src${path.sep}`)
    && !filePath.endsWith(".d.ts")
    && !filePath.includes(`${path.sep}__tests__${path.sep}`)
    && !baseName.includes(".test.")
    && !baseName.includes(".spec.")
  );
}

function collectTypeScriptFiles(directory: string, files: string[] = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        collectTypeScriptFiles(entryPath, files);
      }
    } else if (entry.isFile() && isSourceTypeScriptFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function verifyFile(filePath: string): VerifyResult {
  const source = fs.readFileSync(filePath, "utf8");
  const result = transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: filePath,
    parserOpts: {
      plugins: ["jsx", "typescript"],
      sourceType: "module",
    },
    plugins: [[reactCompiler, {
      panicThreshold: "all_errors",
      target: "19",
    }]],
  });

  return {
    compiled: result?.code?.includes("react/compiler-runtime") === true,
    filePath,
  };
}

function formatRelative(filePath: string) {
  return path.relative(rootDir, filePath);
}

function main() {
  const files = sourceRoots
    .flatMap((sourceRoot) => collectTypeScriptFiles(sourceRoot))
    .sort((left, right) => left.localeCompare(right));
  const results: VerifyResult[] = [];
  const failures: Array<{ error: unknown; filePath: string }> = [];

  for (const filePath of files) {
    try {
      results.push(verifyFile(filePath));
    } catch (error) {
      failures.push({ error, filePath });
    }
  }

  if (failures.length > 0) {
    console.error(`React Compiler failed for ${failures.length} of ${files.length} TypeScript source files.`);
    for (const failure of failures) {
      console.error(`\n${formatRelative(failure.filePath)}`);
      console.error(failure.error instanceof Error ? failure.error.message : failure.error);
    }
    process.exit(1);
  }

  const compiledCount = results.filter((result) => result.compiled).length;
  const skippedCount = results.length - compiledCount;
  console.log(`React Compiler verified ${files.length} TypeScript source files.`);
  console.log(`Compiled output emitted for ${compiledCount} files; ${skippedCount} files had no compiler-runtime output.`);
}

main();
