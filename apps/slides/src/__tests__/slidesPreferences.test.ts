// @ts-nocheck Exercise the real persistence factory with an in-memory native storage boundary.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { defaultPresenterLayout } from "../presenterLayout";

function compileModule(filename, mocks = {}) {
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}

function preferencesFactory() {
  const storage = compileModule(fileURLToPath(new URL("../../../../packages/storage/src/index.ts", import.meta.url)), {
    "./NativeStorage": { default: {
      getStoragePathUri: () => "file:///memory", readStorageText: () => null,
      ensureStorageDirectory: () => true,
    }, __esModule: true },
  });
  return compileModule(fileURLToPath(new URL("../slidesPreferences.ts", import.meta.url)), {
    "@legend-apps/storage": storage,
  }).createSlidesPreferences;
}

test("preferences preserve recent.json fields, normalize legacy layout, and flush updates", async () => {
  const files = new Map([["recent.json", {
    path: "/decks/demo.mdx", presentationDisplayId: "external", presenterLayout: { notesRatio: 9 }, extra: "keep",
  }]]);
  const writes = [];
  const storage = {
    read: (name) => files.get(name),
    write: (name, value) => { files.set(name, JSON.parse(JSON.stringify(value))); writes.push(name); },
    delete: (name) => files.delete(name),
  };
  const createPreferences = preferencesFactory();
  const prefs = createPreferences(storage);
  expect(prefs.getLastDeckPath()).toBe("/decks/demo.mdx");
  expect(prefs.getPresentationDisplayId()).toBe("external");
  expect(prefs.getPresenterLayout().notesRatio).toBeLessThan(1);
  prefs.rememberDeckPath("/decks/next.mdx");
  prefs.rememberPresentationDisplayId("main");
  prefs.resetPresenterLayout();
  await prefs.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(files.get("recent.json")).toMatchObject({
    path: "/decks/next.mdx", presentationDisplayId: "main", presenterLayout: defaultPresenterLayout, extra: "keep",
  });
  expect(writes).toContain("recent.json");
  expect(writes).not.toContain("recent.json.json");
  const restored = createPreferences(storage);
  expect(restored.getLastDeckPath()).toBe("/decks/next.mdx");
  expect(restored.getPresenterLayout()).toEqual(defaultPresenterLayout);
  const empty = createPreferences({ ...storage, read: () => undefined });
  expect(empty.getLastDeckPath()).toBeUndefined();
  expect(empty.getPresenterLayout()).toEqual(defaultPresenterLayout);
});
