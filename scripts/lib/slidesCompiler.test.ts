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

test("packaged compiler compiles local worklets and Webview components without shipping presentation UI or tests", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { gunzipSync } = await import("node:zlib");
  const { packageSlidesCompiler } = await import("./slidesCompiler");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slides-package-test-"));
  try {
    const compiler = packageSlidesCompiler(path.join(temp, "compiler"));
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
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}, 60_000);
