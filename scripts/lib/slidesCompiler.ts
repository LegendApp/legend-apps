import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { rootDir } from "./apps";
import { collectSlidesHostClasses } from "./slidesHostClasses";
import { bundleSlidesCompiler, slidesCompilerEntry } from "./slidesCompilerBundle";

/** Types and source maps are not loaded by the shipped transpile-only compiler. */
export function isCompilerRuntimeFile(file: string) {
  return !/\.map$|\.d\.[cm]?ts$/.test(file);
}

/**
 * react-dom is only bundled into Webview components by esbuild with NODE_ENV=production,
 * so the helper needs the client entry and its production build, not server/dev/profiling builds.
 */
const packageRuntimeFiles: Record<string, RegExp> = {
  "react-dom": /^(package\.json|LICENSE|index\.js|client\.js|cjs\/react-dom(-client)?\.production\.js)$/,
};

export function isPackageRuntimeFile(name: string, relativeFile: string) {
  const allowed = packageRuntimeFiles[name];
  return !allowed || relativeFile === "" || relativeFile === "cjs" || allowed.test(relativeFile);
}

/** Shell launcher: the app passes the resolved runtime (Bun or Node 22+) in LEGEND_SLIDES_RUNTIME. */
export const slidesCompilerLauncher = `#!/bin/sh
compiler_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime="\${LEGEND_SLIDES_RUNTIME:-}"
if [ -z "$runtime" ]; then
  for candidate in "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /usr/local/bin/bun; do
    if [ -x "$candidate" ]; then runtime="$candidate"; break; fi
  done
fi
if [ -z "$runtime" ]; then runtime="$(command -v bun || command -v node || true)"; fi
if [ -z "$runtime" ]; then
  echo "Legend Slides needs Bun or Node 22+ to compile decks." >&2
  exit 127
fi
exec "$runtime" "$compiler_dir/${slidesCompilerEntry}" "$@"
`;

/** Copy only manifests and stylesheets: Tailwind and uniwind resolve their CSS imports from disk. */
function copyStylesheetPackage(from: string, name: string, destination: string) {
  const source = fs.realpathSync(path.dirname(createRequire(path.join(from, "package.json")).resolve(`${name}/package.json`)));
  fs.cpSync(source, destination, { recursive: true, dereference: true,
    filter: file => file === source || (!path.relative(source, file).split(path.sep).includes("node_modules")
      && (fs.statSync(file).isDirectory() || /(^|\/)(package\.json|LICENSE[^/]*)$|\.css$/.test(file))) });
}

/**
 * Package the single-file compiler plus the few packages it loads from disk:
 * native binaries (esbuild, lightningcss, Tailwind oxide) and Webview browser runtimes.
 * No JavaScript runtime is bundled; see `slidesCompilerLauncher`.
 */
export async function packageSlidesCompiler(destination: string) {
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
    fs.cpSync(source, target, { recursive: true, dereference: true, filter: (file) => {
      if (file === source) return true;
      const relative = path.relative(source, file);
      return !relative.split(path.sep).includes("node_modules") && isCompilerRuntimeFile(file) && isPackageRuntimeFile(name, relative.split(path.sep).join("/"));
    } });
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
  const entry = path.join(destination, slidesCompilerEntry);
  await bundleSlidesCompiler(entry);
  fs.mkdirSync(path.join(destination, "shell/src"), { recursive: true });
  fs.writeFileSync(path.join(destination, "shell/src/host-classes.txt"), collectSlidesHostClasses(rootDir));
  fs.writeFileSync(path.join(destination, "shell/src/global.css"),
    fs.readFileSync(path.join(rootDir, "shell/src/global.css"), "utf8") + '\n@source "./host-classes.txt";\n');
  for (const name of ["tailwindcss", "uniwind"]) copyStylesheetPackage(path.join(rootDir, "shell"), name, path.join(destination, "shell/node_modules", name));
  // Under Node, @tailwindcss/node registers this ESM loader by package path.
  const tailwindNode = resolvePackageRoot("@tailwindcss/node", resolvePackageRoot("uniwind", path.join(rootDir, "shell")));
  for (const file of ["package.json", "LICENSE", "dist/esm-cache.loader.mjs"]) {
    if (!fs.existsSync(path.join(tailwindNode, file))) continue;
    fs.mkdirSync(path.dirname(path.join(destination, "node_modules/@tailwindcss/node", file)), { recursive: true });
    fs.copyFileSync(path.join(tailwindNode, file), path.join(destination, "node_modules/@tailwindcss/node", file));
  }
  // Webview components are bundled for the browser from these packages at compile time.
  for (const name of ["react", "react-dom", "@legendapp/state"]) link(install(name, path.join(rootDir, "packages/presentation")), path.join(destination, "node_modules", name));
  // Externals resolved from the bundle. One lightningcss (uniwind's pin) serves both Tailwind and
  // uniwind; it produces byte-identical deck CSS to the previous two-version helper.
  const uniwindRoot = resolvePackageRoot("uniwind", path.join(rootDir, "shell"));
  const externalRoots: Record<string, string> = {
    esbuild: path.join(rootDir, "packages/presentation"),
    lightningcss: uniwindRoot,
    "@tailwindcss/oxide": uniwindRoot,
  };
  for (const [name, from] of Object.entries(externalRoots)) link(install(name, from), path.join(destination, "node_modules", name));
  fs.writeFileSync(path.join(destination, "Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>so.legend.slides.compiler</string><key>CFBundleName</key><string>Slides Compiler</string><key>CFBundlePackageType</key><string>BNDL</string><key>CFBundleVersion</key><string>1</string></dict></plist>');
  fs.writeFileSync(path.join(destination, "run"), slidesCompilerLauncher, { mode: 0o755 });
  return destination;
}

function resolvePackageRoot(name: string, from: string) {
  return fs.realpathSync(path.dirname(createRequire(path.join(from, "package.json")).resolve(`${name}/package.json`)));
}

/** Sign nested compiler executables explicitly; codesign --deep misses arbitrary resource paths. */
export function signSlidesCompiler(directory: string, identity: string) {
  if (fs.existsSync(directory)) {
    const entitlement = path.join(directory, "bun.entitlements.plist");
    fs.writeFileSync(entitlement, '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
    function sign(file: string, jit = false) {
      const result = spawnSync("codesign", ["--force", "--sign", identity, "--options", identity === "-" ? "0" : "runtime", ...(jit ? ["--entitlements", entitlement] : []), file], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`Compiler signing failed: ${result.stderr}`);
    }
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
            sign(file, entry.name === "bun");
          }
        }
      }
    }
    visit(directory);
    // Only bundles that embed a JIT runtime (Bun) need allow-jit; the Slides compiler launches an external one.
    if (fs.existsSync(path.join(directory, "Info.plist"))) sign(directory, fs.existsSync(path.join(directory, "bun")));
  }
}

/** Produce a local, content-addressed download and the pin embedded by Babel. Never uploads. */
export async function packageSlidesCompilerArtifact(output: string, arch: string, identity = process.env.LEGEND_DEVELOPER_ID_APPLICATION
  || (process.env.LEGEND_TEAM_NAME && process.env.LEGEND_TEAM_ID
    ? `Developer ID Application: ${process.env.LEGEND_TEAM_NAME} (${process.env.LEGEND_TEAM_ID})` : "-")) {
  if (arch !== process.arch) throw new Error(`Build the ${arch} compiler on a matching Mac; installed native compiler dependencies are ${process.arch}.`);
  fs.mkdirSync(output, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(output, ".package-"));
  try {
    const helper = await packageSlidesCompiler(path.join(scratch, "slides-compiler.helper"));
    signSlidesCompiler(helper, identity);
    const zip = path.join(scratch, "compiler.zip");
    const packed = spawnSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", "--norsrc", helper, zip], { encoding: "utf8" });
    if (packed.status !== 0) throw new Error(`Compiler archive failed: ${packed.stderr}`);
    const bytes = fs.readFileSync(zip);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const name = `slides-compiler-darwin-${arch}-${sha256}.zip`;
    fs.renameSync(zip, path.join(output, name));
    const artifact = { url: `https://legend.so/slides/compiler/${name}`, sha256, bytes: bytes.length, arch };
    fs.writeFileSync(path.join(output, "artifact.json"), JSON.stringify(artifact, null, 2) + "\n");
    return artifact;
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const [output, arch = process.arch] = process.argv.slice(2);
  if (!output) throw new Error("Usage: bun scripts/lib/slidesCompiler.ts <output-directory> [arm64|x64]");
  console.log(JSON.stringify(await packageSlidesCompilerArtifact(path.resolve(output), arch), null, 2));
}
