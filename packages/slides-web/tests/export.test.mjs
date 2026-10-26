import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportWebsite, usesSkia, validateDestination } from "../export";
import { parsePosition } from "../src/navigation";

test("links restore and clamp both slide and reveal positions", () => {
  expect(parsePosition("#2/3", [1, 4])).toEqual({ currentSlide: 1, currentStep: 2 });
  expect(parsePosition("#99/99", [1, 4])).toEqual({ currentSlide: 1, currentStep: 3 });
  expect(parsePosition("#0/0", [1, 4])).toEqual({ currentSlide: 0, currentStep: 0 });
  expect(parsePosition("#invalid", [1])).toEqual({ currentSlide: 0, currentStep: 0 });
});

test("Skia detection follows compiled host imports and built-in effects, not slide prose", () => {
  expect(usesSkia('const title = "Effect LiquidGlass PresentationCanvas"')).toBe(false);
  expect(usesSkia('const skia = require("@shopify/react-native-skia")')).toBe(true);
  expect(usesSkia('const effect = components.Effect')).toBe(true);
  expect(usesSkia('const canvas = presentation.PresentationCanvas')).toBe(true);
  expect(usesSkia('const { Effect: LocalEffect } = components')).toBe(true);
  expect(usesSkia('const { Slide } = components')).toBe(false);
  expect(usesSkia('props.Effect; state.Effect; slides.Effect; config.Skia')).toBe(false);
  expect(usesSkia('const { Effect, Skia } = props')).toBe(false);
  expect(usesSkia('const components = { Effect: 1 }; components.Effect')).toBe(false);
  expect(usesSkia('function local(presentation) { return presentation.Skia }')).toBe(false);
  expect(usesSkia('components[Effect]')).toBe(false);
  expect(usesSkia('const host = require("@legend-apps/presentation"); const alias = host; alias["Effect"]')).toBe(true);
  expect(usesSkia('const host = require("@legend-apps/presentation"); const { LiquidGlass } = host')).toBe(true);
  expect(usesSkia('const _components = { ...props.components }; const { Effect } = _components')).toBe(true);
  expect(usesSkia('const _components = { Effect: 1 }; _components.Effect')).toBe(false);
  expect(usesSkia('require("number-flow-react-native/skia")')).toBe(true);
  expect(usesSkia('const Lottie = require("lottie-react-native")')).toBe(true);
});

test("exports real assets and preserves a completed export when recompilation fails", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-web-export-")));
  try {
    const source = path.join(dir, "source");
    await fs.mkdir(source);
    const deck = path.join(source, "deck.mdx");
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM5sAAAAASUVORK5CYII=", "base64");
    await fs.writeFile(path.join(source, "..poster.png"), image);
    await fs.symlink("..poster.png", path.join(source, "poster.png"));
    await fs.writeFile(path.join(source, "helper.js"), 'import { Platform } from "react-native"; export const title = Platform.OS;');
    await fs.writeFile(path.join(source, "style.css"), "body{color:red}");
    await fs.writeFile(path.join(source, "font.woff2"), "font");
    await fs.writeFile(deck, 'import { title } from "./helper.js";\nimport "./style.css";\nimport font from "./font.woff2";\nexport const fontURL = font;\n\n# Export test\n\n{title}\n\n![Poster](./..poster.png)\n\n![Linked](./poster.png)');
    const out = path.join(dir, "website");
    await exportWebsite(deck, out);
    expect(await fs.readFile(path.join(out, "assets/..poster.png"))).toEqual(image);
    const initialManifest = JSON.parse(await fs.readFile(path.join(out, "export.json"), "utf8"));
    expect(initialManifest.canvasKit).toBeNull();
    expect(initialManifest.assets.some(file => /helper\.js|style\.css|font\.woff2/.test(file))).toBe(false);
    expect(initialManifest.preload.some(asset => /helper\.js|style\.css|font\.woff2/.test(asset.source))).toBe(false);
    expect(await fs.exists(path.join(out, "assets/font.woff2"))).toBe(false);
    expect((await fs.readdir(out)).some(file => /canvaskit|Roboto/.test(file))).toBe(false);
    expect(await fs.readFile(path.join(out, "index.html"), "utf8")).not.toContain('type="module"');
    expect(initialManifest.preload[0].version).toMatch(/^[a-f0-9]{64}$/);
    await fs.writeFile(path.join(source, "..poster.png"), Buffer.concat([image, Buffer.from("changed")]));
    await exportWebsite(deck, out);
    const changedManifest = JSON.parse(await fs.readFile(path.join(out, "export.json"), "utf8"));
    expect(changedManifest.preload[0].version).not.toBe(initialManifest.preload[0].version);
    const before = await fs.readFile(path.join(out, "player.js"));
    expect(before.toString()).toContain("./assets/..poster.png");
    expect(before.toString()).not.toContain("./assets/poster.png");
    await fs.writeFile(deck, 'export { Canvas } from "@shopify/react-native-skia";\n\n# Hosted Skia');
    const hosted = path.join(dir, "hosted");
    await exportWebsite(deck, hosted, { canvasKitURL: "https://cdn.example.com/canvaskit.wasm" });
    const hostedManifest = JSON.parse(await fs.readFile(path.join(hosted, "export.json"), "utf8"));
    expect(hostedManifest.canvasKit).toBe("https://cdn.example.com/canvaskit.wasm");
    expect(hostedManifest.remoteURLs).toContain("https://cdn.example.com/canvaskit.wasm");
    expect((await fs.readdir(hosted)).some(file => /canvaskit/.test(file))).toBe(false);
    await fs.writeFile(deck, "import Broken from './missing.tsx'\n\n# Broken");
    await expect(exportWebsite(deck, out)).rejects.toThrow();
    expect(await fs.readFile(path.join(out, "player.js"))).toEqual(before);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}, 30000);

test("exports protect sources and unrelated directories, including symlinks", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-web-test-")));
  try {
    const source = path.join(dir, "source");
    await fs.mkdir(source);
    const deck = path.join(source, "deck.mdx");
    await fs.writeFile(deck, "# Test");
    await fs.symlink(source, path.join(dir, "linked-source"));
    await expect(validateDestination(deck, dir)).rejects.toThrow("separate");
    await expect(validateDestination(deck, path.join(source, "out"))).rejects.toThrow("separate");
    await expect(validateDestination(deck, path.join(dir, "linked-source/out"))).rejects.toThrow("separate");
    const out = path.join(dir, "website");
    expect(await validateDestination(deck, out)).toBe(out);
    await fs.mkdir(out);
    await fs.writeFile(path.join(out, "keep.txt"), "unrelated");
    await expect(validateDestination(deck, out)).rejects.toThrow("Refusing");
    expect(await fs.readFile(path.join(out, "keep.txt"), "utf8")).toBe("unrelated");
    await expect(validateDestination(deck, path.join(out, "keep.txt"))).rejects.toThrow("directory");
    await fs.writeFile(path.join(out, "export.json"), JSON.stringify({ format: "legend-slides-web" }));
    expect(await validateDestination(deck, out)).toBe(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
