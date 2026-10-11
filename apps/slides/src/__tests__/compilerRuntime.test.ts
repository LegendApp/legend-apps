// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { compareVersions, findRuntime, installPinnedBun, parseCurlProgress, parseRuntimeVersion, pinnedBun, type RuntimeHost } from "../compilerRuntimeCore";

function fakeHost(files: Record<string, string>, extra: Partial<RuntimeHost> = {}) {
  const calls: string[] = [];
  const host: RuntimeHost = {
    home: "/Users/me", dataDirectory: "/Users/me/Library/Application Support/Slides",
    exists: async path => path in files || Object.keys(files).some(file => file.startsWith(`${path}/`)),
    mkdir: async () => {}, remove: async path => { for (const file of Object.keys(files)) if (file === path || file.startsWith(`${path}/`)) delete files[file]; },
    move: async (from, to) => { for (const file of Object.keys(files)) if (file.startsWith(`${from}/`)) { files[to + file.slice(from.length)] = files[file]; delete files[file]; } },
    run: async (executable, args) => {
      calls.push([executable, ...args].join(" "));
      if (args[0] === "--version") return executable in files ? { code: 0, stdout: files[executable], stderr: "" } : { code: 1, stdout: "", stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    },
    ...extra,
  };
  return { host, calls, files };
}

test("parses runtime versions and enforces minimums", () => {
  expect(parseRuntimeVersion("1.3.14\n")).toBe("1.3.14");
  expect(parseRuntimeVersion("v22.23.3")).toBe("22.23.3");
  expect(parseRuntimeVersion("garbage")).toBeNull();
  expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
  expect(parseCurlProgress("\r###        12.5%\r######     40.0%")).toBe(0.4);
});

test("prefers a chosen runtime, then downloaded Bun, then system Bun, then Node", async () => {
  const base = { "/opt/homebrew/bin/node": "v22.1.0", "/Users/me/.bun/bin/bun": "1.3.2", "/Users/me/Library/Application Support/Slides/runtime/bun-1.3.14/bun": "1.3.14" };
  expect((await findRuntime(fakeHost({ ...base, "/custom/node": "v23.0.0" }).host, { customPath: "/custom/node" }))).toMatchObject({ path: "/custom/node", kind: "node", source: "custom" });
  expect((await findRuntime(fakeHost({ ...base }).host))).toMatchObject({ source: "downloaded", version: "1.3.14" });
  const { "/Users/me/Library/Application Support/Slides/runtime/bun-1.3.14/bun": _, ...noDownload } = base;
  expect((await findRuntime(fakeHost(noDownload).host))).toMatchObject({ path: "/Users/me/.bun/bin/bun", kind: "bun" });
  expect((await findRuntime(fakeHost({ "/opt/homebrew/bin/node": "v22.1.0", "/usr/local/bin/bun": "1.1.0" }).host))).toMatchObject({ path: "/opt/homebrew/bin/node", kind: "node" });
});

test("rejects too-old runtimes and falls back to the login shell", async () => {
  const { host, calls } = fakeHost({ "/opt/homebrew/bin/node": "v20.11.0", "/Users/me/.nvm/versions/node/v22.2.0/bin/node": "v22.2.0" });
  const run = host.run;
  host.run = async (executable, args, options) => executable === "/bin/zsh"
    ? { code: 0, stdout: "Welcome!\n/Users/me/.nvm/versions/node/v22.2.0/bin/node\n", stderr: "" } : run(executable, args, options);
  expect(await findRuntime(host)).toMatchObject({ path: "/Users/me/.nvm/versions/node/v22.2.0/bin/node", version: "22.2.0" });
  expect(await findRuntime(fakeHost({}).host)).toBeNull();
  expect(calls.length).toBeGreaterThan(0);
});

function installHost(sha: string) {
  const state = fakeHost({});
  const run = state.host.run;
  state.host.run = async (executable, args, options) => {
    state.calls.push(executable);
    if (executable === "/usr/bin/curl") { options?.onStderr?.("#### 50.0%"); state.files[args[args.indexOf("-o") + 1]] = "zip"; return { code: 0, stdout: "", stderr: "" }; }
    if (executable === "/usr/bin/shasum") return { code: 0, stdout: `${sha}  ${args[2]}\n`, stderr: "" };
    if (executable === "/usr/bin/ditto") { state.files[`${args[3]}/bun-darwin-aarch64/bun`] = pinnedBun.version; return { code: 0, stdout: "", stderr: "" }; }
    return run(executable, args, options);
  };
  return state;
}

test("installs the pinned Bun only after its checksum matches, then moves it into place", async () => {
  const { host, files } = installHost(pinnedBun.assets.arm64.sha256);
  const progress: number[] = [];
  const runtime = await installPinnedBun(host, { arch: "arm64", onProgress: value => progress.push(value) });
  expect(runtime).toMatchObject({ path: `${host.dataDirectory}/runtime/bun-${pinnedBun.version}/bun`, source: "downloaded" });
  expect(progress).toEqual([0.5, 1]);
  expect(Object.keys(files)).toEqual([`${host.dataDirectory}/runtime/bun-${pinnedBun.version}/bun`]);
});

test("a checksum mismatch leaves nothing installed", async () => {
  const { host, files, calls } = installHost("0".repeat(64));
  await expect(installPinnedBun(host, { arch: "arm64" })).rejects.toThrow("checksum");
  expect(Object.keys(files)).toEqual([]);
  expect(calls).not.toContain("/usr/bin/ditto");
});
