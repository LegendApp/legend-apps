import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { rootDir } from "./apps";

/** Preserve runtime package resolution (including native/dynamic compiler deps). */
export function packageSlidesCompiler(destination: string, bunExecutable = process.execPath) {
  fs.mkdirSync(destination, { recursive: true });
  const copied = new Map<string, string>();
  function install(name: string, from: string): string {
    const require = createRequire(path.join(from, "package.json"));
    let manifest: string;
    try { manifest = require.resolve(`${name}/package.json`); }
    catch {
      let directory = path.dirname(require.resolve(name));
      while (!fs.existsSync(path.join(directory, "package.json"))) directory = path.dirname(directory);
      manifest = path.join(directory, "package.json");
    }
    const source = fs.realpathSync(path.dirname(manifest));
    const known = copied.get(source);
    if (known) return known;
    const target = path.join(destination, "node_modules", ".compiler", `${name.replaceAll("/", "-")}-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`);
    copied.set(source, target);
    fs.cpSync(source, target, { recursive: true, dereference: true, filter: (file) => file === source || !path.relative(source, file).split(path.sep).includes("node_modules") });
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    for (const dependency of new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})])) {
      try { link(install(dependency, source), path.join(target, "node_modules", dependency)); }
      catch (error) {
        if (dependency in (pkg.dependencies ?? {}) && !(dependency in (pkg.optionalDependencies ?? {}))) throw error;
      }
    }
    return target;
  }
  function link(target: string, at: string) {
    fs.mkdirSync(path.dirname(at), { recursive: true });
    if (!fs.existsSync(at)) fs.symlinkSync(path.relative(path.dirname(at), target), at);
  }
  fs.cpSync(path.join(rootDir, "packages/presentation/src"), path.join(destination, "packages/presentation/src"), { recursive: true });
  fs.mkdirSync(path.join(destination, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(rootDir, "scripts/compile-slides.ts"), path.join(destination, "scripts/compile-slides.ts"));
  fs.mkdirSync(path.join(destination, "shell/src"), { recursive: true });
  fs.copyFileSync(path.join(rootDir, "shell/src/global.css"), path.join(destination, "shell/src/global.css"));
  const compilerDependencies = ["@babel/core", "@babel/plugin-transform-block-scoping", "@mdx-js/mdx", "esbuild", "remark-frontmatter", "remark-gfm", "remark-directive", "unplugin-typegpu", "typegpu", "yaml"];
  for (const name of compilerDependencies) link(install(name, path.join(rootDir, "packages/presentation")), path.join(destination, "node_modules", name));
  for (const name of ["uniwind", "tailwindcss"]) link(install(name, path.join(rootDir, "shell")), path.join(destination, "shell/node_modules", name));
  fs.copyFileSync(bunExecutable, path.join(destination, "bun"));
  fs.chmodSync(path.join(destination, "bun"), 0o755);
  fs.writeFileSync(path.join(destination, "run"), '#!/bin/sh\ncompiler_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$compiler_dir/bun" "$compiler_dir/scripts/compile-slides.ts" "$@"\n', { mode: 0o755 });
  return destination;
}

/** Sign nested compiler executables explicitly; codesign --deep misses arbitrary resource paths. */
export function signSlidesCompiler(directory: string, identity: string) {
  if (fs.existsSync(directory)) {
    const entitlement = path.join(directory, "bun.entitlements.plist");
    fs.writeFileSync(entitlement, '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
    function visit(at: string) {
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        const file = path.join(at, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile()) {
          const fd = fs.openSync(file, "r");
          const header = Buffer.alloc(4);
          fs.readSync(fd, header, 0, 4, 0);
          fs.closeSync(fd);
          if (["cffaedfe", "cefaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(header.toString("hex"))) {
            const result = spawnSync("codesign", ["--force", "--sign", identity, "--options", identity === "-" ? "0" : "runtime", ...(entry.name === "bun" ? ["--entitlements", entitlement] : []), file], { encoding: "utf8" });
            if (result.status !== 0) throw new Error(`Compiler signing failed: ${result.stderr}`);
          }
        }
      }
    }
    visit(directory);
  }
}
