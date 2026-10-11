// @ts-nocheck Files and the compiler process are replaced; render the actual Effects page.
import "./nativeMock";
import { beforeEach, expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";

let alerts = [];
mock.module("react-native", () => ({ Platform: { OS: "macos" }, View: "view", Text: "text", Image: "image", Pressable: "pressable", ScrollView: "scroll",
  Linking: { openURL() {} }, Alert: { alert: (...args) => alerts.push(args) } }));
const data = "/Users/me/Library/Application Support/Slides", effects = "/Users/me/Library/Application Support/Legend Slides/effects";
let files = {}, commands = [], respond, loaded = [];
mock.module("@legendapp/spark/files", () => ({
  getDirectory: async () => data,
  exists: async path => Object.keys(files).some(file => file === path || file.startsWith(`${path}/`)),
  list: async path => [...new Set(Object.keys(files).filter(file => file.startsWith(`${path}/`)).map(file => file.slice(path.length + 1).split("/")[0]))]
    .map(name => ({ name, path: `${path}/${name}` })),
  readText: async path => files[path],
}));
mock.module("../compilerCommand", () => ({ runCompilerCommand: async (args, options) => { commands.push(args); return respond(args, options); } }));
mock.module("@legend-apps/runtime-utils", () => ({ decodeProcessText: value => typeof value === "string" ? value : new TextDecoder().decode(value) }));
mock.module("../deckLoader", () => ({ loadDeck: async path => { loaded.push(path); }, parseCompilerResult: JSON.parse }));
const slidesState$ = observable({ deckLocked: false, audienceOpen: false });
mock.module("../slidesStore", () => ({ slidesState$, getSlidesState: () => slidesState$.peek() }));
mock.module("@legend-apps/presentation", () => ({ NativeVideoView: "video" }));
mock.module("../compilerRuntime", () => ({ compilerRuntime$: observable({}), changeCompilerRuntime() {}, resolveCompilerRuntime() {}, downloadCompilerRuntime() {}, setCustomCompilerRuntime() {} }));
mock.module("@legendapp/spark/dialogs", () => ({ openFileDialog() {} }));
mock.module("@legendapp/spark/settings/window", () => ({
  SettingsSection: ({ title, description, headerRight, children }) => <section title={title} description={description}>{headerRight}{children}</section>,
  SettingsRow: ({ title, description, control }) => <row title={title} description={description}>{control}</row>,
}));
const { EffectsSettingsPage } = await import("../EffectsSettingsPage");
const { effectRequests$ } = await import("../effectRequests");
const { effectPackRows, catalogResource } = await import("../effectLibrary");

const pin = (version, sha) => ({ version, sha256: sha.repeat(64) });
const release = (version, sha) => ({ ...pin(version, sha), url: `/packs/${version}.json`, bytes: 10, hostApiVersion: 1, capabilities: [], dependencies: {}, exports: { Main: "./Main.tsx" } });
const effect = (slug, pack, video) => ({ slug, pack, title: `${slug} title`, description: `${slug} description`, entry: "Main", symbol: "Main", tags: [], props: [], snippet: "",
  example: { url: "/e.mdx", sha256: "e".repeat(64), bytes: 1 }, preview: { poster: `/previews/${slug}.png`, ...(video ? { video: `/previews/${slug}.mp4` } : {}), renderer: "test" } });
const catalog = { schemaVersion: 1, effects: [effect("aurora", "backgrounds", true), effect("bars", "charts")], packs: {
  backgrounds: { latest: "2.0.0", versions: { "1.0.0": release("1.0.0", "a"), "2.0.0": release("2.0.0", "b") } },
  charts: { latest: "1.0.0", versions: { "1.0.0": release("1.0.0", "c") } },
  media: { latest: "1.0.0", versions: { "1.0.0": release("1.0.0", "d") } },
} };
const url = "https://legend.so/slides/effects/catalog.json";
const ok = value => ({ timedOut: false, stdout: JSON.stringify({ success: true, ...value }), stderr: "" });
const turn = () => new Promise(done => setTimeout(done, 0));
const section = (renderer, title) => renderer.root.findAll(node => node.type === "section" && node.props.title === title)[0];
const button = (node, label) => node.findAll(child => child.type === "pressable" && child.props.accessibilityLabel === label)[0];
async function render() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer;
  await act(async () => { renderer = create(<EffectsSettingsPage />); await turn(); });
  return renderer;
}
beforeEach(() => {
  alerts = []; commands = []; loaded = [];
  files = { [`${effects}/backgrounds/active.json`]: JSON.stringify(pin("1.0.0", "a")), [`${effects}/charts/active.json`]: JSON.stringify(pin("1.0.0", "c")),
    [`${effects}/examples/aurora/example.mdx`]: "" };
  respond = args => args[0] === "--effect-catalog" ? ok({ catalog, url }) : ok({});
  effectRequests$.assign({ pending: null, busy: false, message: "", error: "", progress: null });
  slidesState$.assign({ deckLocked: false, audienceOpen: false });
});

test("rows combine catalog packs with installed selections", () => {
  const rows = effectPackRows(catalog, { backgrounds: pin("1.0.0", "a"), charts: pin("1.0.0", "c"), local: pin("1.0.0", "f") });
  expect(rows.map(row => [row.id, row.state, row.effects.map(item => item.slug)])).toEqual([
    ["backgrounds", "update", ["aurora"]], ["charts", "installed", ["bars"]], ["local", "installed", []], ["media", "available", []]]);
  expect(effectPackRows(catalog, { charts: pin("1.0.0", "f") })[1].state).toBe("update");
  expect(effectPackRows(null, { charts: pin("1.0.0", "c") }).map(row => [row.id, row.state, row.latest])).toEqual([["charts", "installed", undefined]]);
});

test("preview URLs resolve beside the catalog and stay on its origin", () => {
  expect(catalogResource("/slides/p.png", url)).toBe("https://legend.so/slides/p.png");
  expect(catalogResource("previews/p.png", url)).toBe("https://legend.so/slides/effects/previews/p.png");
  expect(catalogResource("https://legend.so/p.mp4", url)).toBe("https://legend.so/p.mp4");
  for (const resource of ["https://evil.example/p.png", "//evil.example/p.png", "javascript:alert(1)"]) expect(catalogResource(resource, url)).toBeUndefined();
});

test("lists packs with previews, versions and state, and installs updates with progress", async () => {
  const renderer = await render();
  try {
    const backgrounds = section(renderer, "Backgrounds");
    expect(backgrounds.props.description).toBe("Update available · 1.0.0 · Latest 2.0.0 · aurora title");
    expect(section(renderer, "Charts").props.description).toBe("Installed · 1.0.0 · bars title");
    expect(section(renderer, "Media").props.description).toBe("Not installed · Latest 1.0.0");
    expect(section(renderer, "Examples")).toBeUndefined();
    expect(button(section(renderer, "Charts"), "Install")).toBeUndefined();
    expect(backgrounds.findByType("image").props.source.uri).toBe("https://legend.so/previews/aurora.png");
    await act(() => button(backgrounds, "Play aurora title preview").props.onPress());
    expect(backgrounds.findByType("video").props.source).toBe("https://legend.so/previews/aurora.mp4");

    let finish;
    respond = (args, options) => args[0] === "--effect-action" ? new Promise(done => {
      options.onOutput({ stream: "stderr", bytes: '{"effectProgress":{"pack":"backgrounds","receivedBytes":4,"totalBytes":10}}\n{"effect' });
      finish = () => { files[`${effects}/backgrounds/active.json`] = JSON.stringify(pin("2.0.0", "b")); done(ok({})); };
    }) : ok({ catalog, url });
    effectRequests$.pending.set({ path: "/deck.mdx", packs: ["backgrounds"] });
    await act(async () => { button(section(renderer, "Backgrounds"), "Update to 2.0.0").props.onPress(); await turn(); });
    expect(commands.at(-1)).toEqual(["--effect-action", "legend-slides://effects/install?pack=backgrounds&version=2.0.0"]);
    const bar = renderer.root.findByProps({ accessibilityRole: "progressbar" });
    expect(bar.props.accessibilityLabel).toBe("Updating backgrounds 2.0.0… backgrounds 40%");
    expect(button(section(renderer, "Media"), "Install").props.disabled).toBe(true);
    await act(async () => { finish(); await turn(); await turn(); });
    expect(section(renderer, "Backgrounds").props.description).toStartWith("Installed · 2.0.0");
    expect(renderer.root.findAll(node => node.type === "row" && node.props.title === "Updated backgrounds 2.0.0. It is available offline.")).toHaveLength(1);
    expect(loaded).toEqual(["/deck.mdx"]);
  } finally { await act(() => renderer.unmount()); }
});

test("removal asks first, runs under the compiler's lease and reports failures", async () => {
  const renderer = await render();
  try {
    await act(() => button(section(renderer, "Charts"), "Remove").props.onPress());
    expect(alerts[0][0]).toBe("Remove charts?");
    expect(commands).toEqual([["--effect-catalog"]]);
    respond = () => { delete files[`${effects}/charts/active.json`]; return ok({}); };
    await act(async () => { alerts[0][2][1].onPress(); await turn(); await turn(); });
    expect(commands.at(-1)).toEqual(["--remove-effect", "charts"]);
    expect(section(renderer, "Charts").props.description).toBe("Not installed · Latest 1.0.0 · bars title");
    respond = () => ({ timedOut: false, stdout: JSON.stringify({ success: false, errors: ["Another effect installation is running."] }), stderr: "" });
    await act(async () => { button(section(renderer, "Media"), "Install").props.onPress(); await turn(); await turn(); });
    expect(renderer.root.findAll(node => node.type === "row" && node.props.description === "Another effect installation is running.")).toHaveLength(1);
  } finally { await act(() => renderer.unmount()); }
});

test("offline shows installed packs and presenting blocks changes", async () => {
  respond = () => ok({ success: false, errors: ["Effect download failed (503)."] });
  slidesState$.audienceOpen.set(true);
  const renderer = await render();
  try {
    expect(renderer.root.findAll(node => node.type === "section").map(node => node.props.title)).toEqual(["Effect Packs", "Backgrounds", "Charts"]);
    expect(section(renderer, "Backgrounds").props.description).toBe("Installed · 1.0.0");
    expect(renderer.root.findAll(node => node.type === "row" && node.props.title === "Catalog unavailable")[0].props.description).toContain("503");
    expect(renderer.root.findAll(node => node.type === "row" && node.props.title === "Presenting")).toHaveLength(1);
    expect(button(section(renderer, "Charts"), "Remove").props.disabled).toBe(true);
    respond = args => args[0] === "--effect-catalog" ? ok({ catalog, url }) : ok({});
    await act(async () => { button(renderer.root, "Try Again").props.onPress(); await turn(); });
    expect(section(renderer, "Media").props.description).toBe("Not installed · Latest 1.0.0");
  } finally { await act(() => renderer.unmount()); }
});
