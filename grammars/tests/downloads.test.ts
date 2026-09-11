import { describe, expect, test } from "bun:test";
import { canonicalGrammar, createGrammarManager, detectGrammar, validateGrammarManifest, type GrammarIO, type GrammarManifest } from "../../packages/syntax-parser/src/grammarDownloads";
import { validateCatalog } from "../scripts/catalog";

function manifest(names = ["python"]): GrammarManifest {
  return { schemaVersion: 1, packABI: 1, version: "1", packs: Object.fromEntries(names.map((name) => [name, {
    dependencies: [], platforms: { "macos-arm64": { filename: `${name}-macos-arm64.dylib`, bytes: 100,
      sha256: "a".repeat(64), url: `https://github.com/LegendApp/legend-apps/releases/download/grammars-v1/${name}-macos-arm64.dylib` } },
  }])) };
}
function fixture(data = manifest()) {
  const installed = new Set<string>();
  const calls: string[] = [];
  const io: GrammarIO = { platform: () => "macos-arm64", loaded: (name) => installed.has(name),
    manifest: async () => data, install: async (name, _artifact, progress) => {
      calls.push(name); progress(25, 100); await Promise.resolve(); installed.add(name); progress(100, 100);
    } };
  return { io, installed, calls };
}
describe("downloadable grammars", () => {
  test("catalog is pinned and dependency-safe", validateCatalog);
  test("detects aliases, case-insensitive extensions, filenames, shebangs and unknown text", () => {
    expect(canonicalGrammar("JSX")).toBe("javascript");
    expect(detectGrammar("/src/Main.RS")).toBe("rust");
    expect(detectGrammar("Dockerfile")).toBe("dockerfile");
    expect(detectGrammar("script", "#!/usr/bin/env python3")).toBe("python");
    expect(detectGrammar("data.json5")).toBe("json5");
    expect(detectGrammar("notes.unknown")).toBe("");
  });
  test("deduplicates simultaneous requests and exposes byte progress", async () => {
    const f = fixture(), manager = createGrammarManager(f.io);
    const seen: number[] = [];
    const unsubscribe = manager.subscribe("py", () => seen.push(manager.getSnapshot("py").completed));
    await Promise.all([manager.ensure("py"), manager.ensure("python"), manager.ensure("PY")]);
    unsubscribe();
    expect(f.calls).toEqual(["python"]);
    expect(seen).toContain(25);
    expect(manager.getSnapshot("python").phase).toBe("ready");
  });
  test("loaded grammars do not fetch a manifest or download again", async () => {
    const f = fixture(); f.installed.add("python"); f.io.manifest = async () => { throw Error("offline"); };
    await createGrammarManager(f.io).ensure("python"); expect(f.calls).toEqual([]);
  });
  test("installs dependencies before the requesting language", async () => {
    const data = manifest(["mdx", "markdown-inline", "yaml"]);
    data.packs.mdx.dependencies = ["markdown-inline", "yaml"];
    const f = fixture(data); await createGrammarManager(f.io).ensure("mdx");
    expect(f.calls).toEqual(["markdown-inline", "yaml", "mdx"]);
  });
  test("offline failure is retryable without poisoning the shared promise", async () => {
    const f = fixture(); const read = f.io.manifest; f.io.manifest = async () => { throw Error("offline"); };
    const manager = createGrammarManager(f.io);
    await expect(manager.ensure("python")).rejects.toThrow("offline");
    expect(manager.getSnapshot("python").phase).toBe("error");
    f.io.manifest = read; await manager.ensure("python"); expect(manager.getSnapshot("python").phase).toBe("ready");
  });
  test("failed installation and false-success are rejected and retryable", async () => {
    const f = fixture(); const install = f.io.install; f.io.install = async () => {};
    const manager = createGrammarManager(f.io);
    await expect(manager.ensure("python")).rejects.toThrow("did not load");
    f.io.install = install; await manager.ensure("python"); expect(f.calls).toEqual(["python"]);
  });
  test("rejects foreign URLs, malformed hashes, size limits, ABI mismatches and cycles", () => {
    for (const mutate of [
      (m: any) => { m.packABI = 99; },
      (m: any) => { m.packs.python.platforms["macos-arm64"].url = "https://evil.example/parser.dylib"; },
      (m: any) => { m.packs.python.platforms["macos-arm64"].sha256 = "invalid"; },
      (m: any) => { m.packs.python.platforms["macos-arm64"].bytes = 1e12; },
      (m: any) => { m.packs.python.dependencies = ["python"]; },
      (m: any) => { m.packs.python.dependencies = ["missing"]; },
    ]) { const data = manifest(); mutate(data); expect(() => validateGrammarManifest(data)).toThrow(); }
  });
  test("unknown platforms fail without attempting installation", async () => {
    const f = fixture(); f.io.platform = () => "ios-arm64";
    await expect(createGrammarManager(f.io).ensure("python")).rejects.toThrow("No ios-arm64");
    expect(f.calls).toEqual([]);
  });
});
