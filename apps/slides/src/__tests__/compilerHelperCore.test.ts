// @ts-nocheck Real archive, checksum, extraction and compiler execution through the same host boundary as the app.
import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { installCompilerHelper } from "../compilerHelperCore";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slides-download-test-"));
  const helper = path.join(root, "slides-compiler.helper");
  await fs.mkdir(helper);
  await fs.writeFile(path.join(helper, "run"), '#!/bin/sh\nprintf "compiled:%s" "$1"\n', { mode: 0o755 });
  const zip = path.join(root, "source.zip");
  expect(await Bun.spawn(["/usr/bin/ditto", "-c", "-k", "--keepParent", helper, zip]).exited).toBe(0);
  const bytes = await fs.readFile(zip);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const asset = { sha256, bytes: bytes.length, arch: process.arch, url: `https://legend.so/slides/compiler/${sha256}.zip` };
  const calls = [], messages = [];
  let offline = false, corrupt = false, unpackFails = false;
  const host = {
    dataDirectory: path.join(root, "Application Support"), home: root,
    exists: file => fs.access(file).then(() => true, () => false),
    mkdir: file => fs.mkdir(file, { recursive: true }),
    remove: file => fs.rm(file, { force: true, recursive: true }),
    move: (from, to) => fs.rename(from, to),
    async run(executable, args) {
      calls.push([executable, ...args]);
      if (executable === "/usr/bin/curl") {
        if (offline) return { code: 7, stdout: "", stderr: "offline" };
        await fs.writeFile(args[args.indexOf("-o") + 1], corrupt ? "bad archive" : bytes);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (executable === "/usr/bin/ditto" && unpackFails) return { code: 1, stdout: "", stderr: "disk full" };
      const child = Bun.spawn([executable, ...args], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      return { stdout, stderr, code };
    },
  };
  return { host, asset, calls, root, messages, install: () => installCompilerHelper(host, asset, text => messages.push(text)),
    setOffline: value => { offline = value; }, setCorrupt: value => { corrupt = value; }, setUnpackFails: value => { unpackFails = value; },
    cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test("first need installs verified code; a new launch reuses the offline ZIP and repairs extracted files", async () => {
  const f = await fixture();
  try {
    const entry = await f.install();
    expect((await f.host.run(entry, ["deck.mdx"])).stdout).toBe("compiled:deck.mdx");
    expect(f.calls.filter(call => call[0].endsWith("curl"))).toHaveLength(1);
    await fs.writeFile(entry, "damaged");
    f.setOffline(true);
    expect(await f.install()).toBe(entry);
    expect((await f.host.run(entry, ["offline.mdx"])).stdout).toBe("compiled:offline.mdx");
    expect(f.calls.filter(call => call[0].endsWith("curl"))).toHaveLength(1);
    expect((await fs.readdir(path.dirname(entry))).includes("run")).toBe(true);
  } finally { await f.cleanup(); }
});

test("offline first use fails actionably, cleans staging and can retry", async () => {
  const f = await fixture();
  try {
    f.setOffline(true);
    await expect(f.install()).rejects.toThrow("Connect to the internet");
    expect(await fs.readdir(`${f.host.dataDirectory}/compiler`)).toEqual([]);
    f.setOffline(false);
    expect((await f.install()).endsWith("/run")).toBe(true);
  } finally { await f.cleanup(); }
});

test("wrong download hash is never extracted; damaged cached ZIP also needs a verified replacement", async () => {
  const f = await fixture();
  try {
    f.setCorrupt(true);
    await expect(f.install()).rejects.toThrow("integrity check");
    expect(f.calls.some(call => call[0].endsWith("ditto"))).toBe(false);
    f.setCorrupt(false);
    const entry = await f.install();
    await fs.writeFile(`${f.host.dataDirectory}/compiler/${f.asset.sha256}.zip`, "corrupt");
    f.setOffline(true);
    await expect(f.install()).rejects.toThrow("retry this action");
    f.setOffline(false);
    expect(await f.install()).toBe(entry);
  } finally { await f.cleanup(); }
});

test("extraction failure keeps verified archive for offline retry and never exposes partial code", async () => {
  const f = await fixture();
  try {
    f.setUnpackFails(true);
    await expect(f.install()).rejects.toThrow("free disk space");
    expect(await f.host.exists(`${f.host.dataDirectory}/compiler/${f.asset.sha256}/run`)).toBe(false);
    f.setUnpackFails(false); f.setOffline(true);
    expect((await f.install()).endsWith("/run")).toBe(true);
    expect(f.calls.filter(call => call[0].endsWith("curl"))).toHaveLength(1);
  } finally { await f.cleanup(); }
});

test("untrusted metadata and a different architecture are rejected before network or extraction", async () => {
  const f = await fixture();
  try {
    await expect(installCompilerHelper(f.host, { ...f.asset, url: "https://evil.example/compiler.zip" }, () => {})).rejects.toThrow("invalid compiler");
    await expect(installCompilerHelper(f.host, { ...f.asset, arch: "other" }, () => {})).rejects.toThrow("doesn't support this Mac");
    expect(f.calls.some(call => /curl|ditto/.test(call[0]))).toBe(false);
  } finally { await f.cleanup(); }
});
