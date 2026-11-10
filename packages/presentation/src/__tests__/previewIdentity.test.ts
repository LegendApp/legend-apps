import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPreviewIdentity } from "../compiler/previewIdentity";
import { updateSlideSpeakerNotes } from "../speakerNotesSource";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slides-preview-key-"));
  directories.push(directory);
  const deck = path.join(directory, "deck.mdx"), helper = path.join(directory, "helper.tsx"), asset = path.join(directory, "image.png");
  fs.writeFileSync(deck, "# Slide"); fs.writeFileSync(helper, "export const size = 10;"); fs.writeFileSync(asset, new Uint8Array([1, 2, 3]));
  return { directory, deck, helper, asset };
}

test("speaker-note edits, insertion and removal preserve the visual fingerprint", async () => {
  const f = fixture();
  const source = '---\ntitle: Demo\n---\nimport { size } from "./helper";\n\n# Slide\n\n---\n\n# Second\n';
  const key = await createPreviewIdentity(f.deck, source, [f.helper, f.asset], "compiler", Infinity);
  expect(key?.content).toMatch(/^[a-f0-9]{64}$/);
  let changed = source;
  for (const notes of ["first note", "many\nlines\nof notes", ""]) {
    changed = updateSlideSpeakerNotes(changed, 1, notes);
    expect(await createPreviewIdentity(f.deck, changed, [f.asset, f.helper], "compiler", Infinity)).toEqual(key);
  }
});

test("visual content, imports, assets, document config and compiler changes invalidate", async () => {
  const f = fixture();
  const source = "---\ntitle: Demo\n---\n# Slide\n";
  const key = await createPreviewIdentity(f.deck, source, [f.helper, f.asset], "compiler", Infinity);
  for (const changed of [source.replace("# Slide", "# Other"), source.replace("Demo", "Other")])
    expect((await createPreviewIdentity(f.deck, changed, [f.helper, f.asset], "compiler", Infinity))?.content).not.toBe(key?.content);
  expect((await createPreviewIdentity(f.deck, source, [f.helper, f.asset], "new compiler", Infinity))?.content).not.toBe(key?.content);
  fs.writeFileSync(f.helper, "export const size = 11;");
  const helperKey = await createPreviewIdentity(f.deck, source, [f.helper, f.asset], "compiler", Infinity);
  expect(helperKey?.content).not.toBe(key?.content);
  fs.writeFileSync(f.asset, new Uint8Array([3, 2, 1]));
  expect((await createPreviewIdentity(f.deck, source, [f.helper, f.asset], "compiler", Infinity))?.content).not.toBe(helperKey?.content);
});

test("comments displayed inside code fences remain visual content", async () => {
  const f = fixture(), source = "# Slide\n\n```html\n<!-- visible code -->\n```";
  const before = await createPreviewIdentity(f.deck, source, [], "compiler", Infinity);
  expect((await createPreviewIdentity(f.deck, source.replace("visible code", "changed code"), [], "compiler", Infinity))?.content).not.toBe(before?.content);
});

test("missing or concurrently edited dependencies disable persistent reuse", async () => {
  const f = fixture();
  expect(await createPreviewIdentity(f.deck, "# Slide", [f.helper], "compiler", 0)).toBeUndefined();
  expect(await createPreviewIdentity(f.deck, "# Slide", [path.join(f.directory, "missing")], "compiler", Infinity)).toBeUndefined();
});
