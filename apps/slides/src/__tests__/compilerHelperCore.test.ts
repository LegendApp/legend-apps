// @ts-nocheck Exercise the actual SDK helper copy, archive verification and preparation offline.
import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareCompilerHelper } from "../compilerHelperCore";
import { writeSlidesCompilerBundle } from "../../../../scripts/lib/slidesCompiler";
import { signMacOSAppInsideOut } from "../../../../scripts/lib/macosCodeSign";
import { sparkSdkRoot } from "../../../../scripts/lib/sparkSdk";
import { sparkConfig } from "../../../../scripts/lib/sparkWorkspaces";
import { loadAppManifest } from "../../../../scripts/lib/apps";

const { copyHelpers, resolveHelpers } = await import(pathToFileURL(path.join(sparkSdkRoot, "vendor/node_modules/@legendapp/spark-cli/dist/helpers.js")).href);
const { hashFiles } = await import(pathToFileURL(path.join(sparkSdkRoot, "vendor/node_modules/@legendapp/spark-cli/dist/project.js")).href);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slides-builtin-test-"));
  const helper = path.join(root, "slides-compiler.helper");
  await fs.mkdir(helper);
  await fs.writeFile(path.join(helper, "run"), '#!/bin/sh\nprintf "compiled:%s" "$1"\n', { mode: 0o755 });
  await fs.writeFile(path.join(helper, "dependency"), "bundled dependency");
  await fs.symlink("dependency", path.join(helper, "dependency-link"));
  const zip = path.join(root, "source.zip");
  expect(await Bun.spawn(["/usr/bin/ditto", "-c", "-k", "--keepParent", helper, zip]).exited).toBe(0);
  const bundle = path.join(root, ".spark/compiler/helper");
  const pin = writeSlidesCompilerBundle(bundle, zip);
  const app = path.join(root, "Relocated App");
  const config = sparkConfig(await loadAppManifest("slides"), "release");
  copyHelpers(root, app, config.helpers, "macos", process.arch);
  const preparedBundle = path.join(app, "Contents/Helpers/slides-compiler.helper");
  const host = { dataDirectory: path.join(root, "Application Support"), exists: file => fs.access(file).then(() => true, () => false) };
  const messages = [], calls = [];
  const run = async (executable, args = [], env = {}) => {
    calls.push([executable, ...args]);
    const child = Bun.spawn([executable, ...args], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, code };
  };
  const prepare = cache => run(path.join(preparedBundle, "run"), [], { LEGEND_SLIDES_COMPILER_CACHE: cache, PATH: "/usr/bin:/bin" });
  return { root, app, zip, bundle, config, preparedBundle, pin, host, calls, messages, run,
    install: () => prepareCompilerHelper(host, prepare, text => messages.push(text)),
    cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test("Release includes a relocatable compiler and first use works with no download metadata or network", async () => {
  const f = await fixture();
  try {
    expect((await fs.readFile(path.join(f.preparedBundle, ".spark-entry"), "utf8"))).toBe("run");
    const entry = await f.install();
    expect((await f.run(entry, ["deck.mdx"])).stdout).toBe("compiled:deck.mdx");
    expect(await fs.readFile(path.join(path.dirname(entry), "dependency-link"), "utf8")).toBe("bundled dependency");
    expect(f.calls.some(call => call[0].includes("curl"))).toBe(false);
    expect(f.messages).toEqual(["Preparing built-in deck compiler…"]);
    await fs.writeFile(entry, "damaged extraction");
    expect(await f.install()).toBe(entry);
    expect((await f.run(entry, ["offline.mdx"])).stdout).toBe("compiled:offline.mdx");
    expect((await fs.readdir(path.dirname(entry))).includes("run")).toBe(true);
  } finally { await f.cleanup(); }
});

test("a corrupted built-in archive fails closed without extracting or trying the network", async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.preparedBundle, "compiler.zip"), "corrupt");
    await expect(f.install()).rejects.toThrow("integrity check");
    expect(await fs.readdir(`${f.host.dataDirectory}/compiler`)).toEqual([]);
  } finally { await f.cleanup(); }
});

test("SDK helper fingerprints include the compiler payload, and Debug does not declare it", async () => {
  const f = await fixture();
  try {
    const helpers = resolveHelpers(f.root, f.config.helpers, "macos", process.arch);
    expect(helpers[0].files.some(file => file.endsWith("compiler.zip"))).toBe(true);
    const before = hashFiles(f.root, helpers[0].files);
    await fs.appendFile(path.join(f.bundle, "compiler.zip"), "changed");
    expect(hashFiles(f.root, helpers[0].files)).not.toBe(before);
    expect(sparkConfig(await loadAppManifest("slides"), "dev").helpers).toBeUndefined();
  } finally { await f.cleanup(); }
});

test("invalid preparation output and missing extracted entries are never executed", async () => {
  const host = { dataDirectory: "/data", exists: async () => false };
  for (const stdout of ["/elsewhere/run", `/data/compiler/${"a".repeat(64)}/../run`, `/data/compiler/${"a".repeat(64)}/run`]) {
    await expect(prepareCompilerHelper(host, async () => ({ code: 0, stdout, stderr: "" }), () => {})).rejects.toThrow("incomplete");
  }
  await expect(prepareCompilerHelper(host, async () => ({ code: 0, timedOut: true, stdout: "", stderr: "" }), () => {})).rejects.toThrow("built-in");
});

test.skipIf(process.platform !== "darwin")("the copied helper signs with Spark's ad-hoc pass and inside-out", async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.join(f.app, "Contents/MacOS"), { recursive: true });
    await fs.copyFile("/usr/bin/true", path.join(f.app, "Contents/MacOS/Slides"));
    await fs.writeFile(path.join(f.app, "Contents/Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Slides</string><key>CFBundleIdentifier</key><string>so.legend.slides.signing-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
    const codesign = (...args) => {
      const result = Bun.spawnSync(["codesign", ...args, f.app]);
      expect(result.stderr.toString()).not.toContain("bundle format unrecognized");
      expect(result.exitCode).toBe(0);
    };
    codesign("--force", "--deep", "--sign", "-");
    codesign("--verify", "--deep", "--strict");
    signMacOSAppInsideOut(f.app, "-");
    codesign("--verify", "--deep", "--strict");
  } finally { await f.cleanup(); }
});
