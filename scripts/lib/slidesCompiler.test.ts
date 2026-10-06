// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { isCompilerRuntimeFile } from "./slidesCompiler";

test("compiler packaging omits maps and declarations while retaining runtime TypeScript and native modules", () => {
  for (const name of ["index.js.map", "index.d.ts", "index.d.mts", "index.d.cts", "index.d.ts.map"]) {
    expect(isCompilerRuntimeFile(name)).toBe(false);
  }
  for (const name of ["compileVirtual.ts", "index.mjs", "index.cjs", "lightningcss.node", "package.json", "LICENSE", "theme.css"]) {
    expect(isCompilerRuntimeFile(name)).toBe(true);
  }
});

test("packaged compiler signs as a helper bundle and compiles local worklets and Webview components", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { gunzipSync } = await import("node:zlib");
  const { packageSlidesCompiler } = await import("./slidesCompiler");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slides-package-test-"));
  try {
    const app = path.join(temp, "Slides.app");
    const compiler = packageSlidesCompiler(path.join(app, "Contents/Helpers/slides-compiler.helper"));
    fs.writeFileSync(path.join(compiler, ".spark-entry"), "run");
    if (process.platform === "darwin") {
      const { spawnSync } = await import("node:child_process");
      const { signSlidesCompiler } = await import("./slidesCompiler");
      fs.mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
      fs.copyFileSync("/usr/bin/true", path.join(app, "Contents/MacOS/Slides"));
      fs.writeFileSync(path.join(app, "Contents/Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Slides</string><key>CFBundleIdentifier</key><string>so.legend.slides.signing-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
      signSlidesCompiler(compiler, "-");
      for (const args of [["--force", "--sign", "-", app], ["--verify", "--deep", "--strict", app]]) {
        const result = spawnSync("codesign", args, { encoding: "utf8" });
        expect(result.stderr).not.toContain("bundle format unrecognized");
        expect(result.status).toBe(0);
      }
      const entitlement = spawnSync("codesign", ["-d", "--entitlements", ":-", compiler], { encoding: "utf8" });
      expect(entitlement.status).toBe(0);
      expect(entitlement.stdout).toContain("com.apple.security.cs.allow-jit");
    }
    const sources = path.join(compiler, "packages/presentation/src");
    expect(fs.readdirSync(sources).sort()).toEqual(["compiler", "layout.ts", "speakerNotesSource.ts", "transitions"]);
    expect(fs.readdirSync(sources, { recursive: true }).some(file => /__tests__|\.test\./.test(String(file)))).toBe(false);
    const deck = path.join(temp, "deck.mdx");
    fs.writeFileSync(deck, '---\ntransition: fade\n---\nexport { pose } from "./pose"\n\n# Portable\n\n<Webview component="./Panel.tsx" />');
    fs.writeFileSync(path.join(temp, "pose.ts"), 'export function pose(x: number) { "worklet"; return x * 2; }');
    fs.writeFileSync(path.join(temp, "Panel.tsx"), 'import { observable } from "@legendapp/state"; import { useValue } from "@legendapp/state/react"; const label = observable("Portable webview"); export default function Panel() { return <div>{useValue(label)}</div>; }');
    const child = Bun.spawn([path.join(compiler, "run"), deck], { cwd: temp, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    const result = JSON.parse(gunzipSync(Buffer.from(JSON.parse(stdout).data, "base64")).toString());
    expect(result).toMatchObject({ success: true });
    expect(result.code).toContain("__workletHash");
    expect(result.uniwindCode).toContain("stylesheet");
    if (process.platform === "darwin") {
      const { spawnSync } = await import("node:child_process");
      const verified = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
      expect(verified.status).toBe(0);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}, 60_000);
