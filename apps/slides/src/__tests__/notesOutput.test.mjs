import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");
function setup() {
  const calls = [];
  const roles = { audience: "audience", notes: "notes" };
  const display = { id: "current-id", persistentId: "notes", frame: { x: 1920, y: 0, width: 1920, height: 1080 } };
  const modules = {
    "@legendapp/state": { observable: values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { peek: () => value, set: next => { value = next; } }])) },
    "@legendapp/spark/windows/managed": {
      closeWindow: async id => { calls.push(["close", id]); },
      getDisplays: async () => [{ isMain: true, visibleFrame: { x: 0, y: 0, width: 1440, height: 900 } }],
      WindowStyleMask: { Titled: 1, Closable: 2, Resizable: 4 },
    },
    "./slidesWindows": { slidesWindows: { open: async (id, options) => { calls.push(["open", id, options]); } } },
    "./displayRoles": { displayKey: display => display.persistentId || display.id },
    "./slidesSettings": { displayRolesSetting: { get: () => roles } },
  };
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL("../notesOutput.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  Function("require", "module", "exports", code)(name => modules[name], module, module.exports);
  return { ...module.exports, calls, display, roles };
}
test("notes open only on their assigned display, close on unplug, and restore on reconnect", async () => {
  const app = setup();
  await app.syncNotesOutput([app.display], true);
  assert.equal(app.calls[0][2].x, 1920);
  await app.syncNotesOutput([app.display], true);
  assert.equal(app.calls.length, 1);
  await app.syncNotesOutput([], true);
  assert.deepEqual(app.calls[1], ["close", "slides-notes"]);
  await app.syncNotesOutput([{ ...app.display, id: "reconnected" }], true);
  assert.equal(app.calls[2][0], "open");
  await app.syncNotesOutput([app.display], false);
  assert.equal(app.calls[3][0], "close");
});
test("preview uses the laptop frame without changing roles, timer, or requiring audience output", async () => {
  const app = setup();
  app.notesOutput$.elapsed.set(1234);
  await app.previewNotesOutput();
  assert.equal(app.notesOutput$.preview.peek(), true);
  assert.equal(app.calls[1][2].x, 220);
  assert.equal(app.notesOutput$.elapsed.peek(), 1234);
  assert.deepEqual(app.roles, { audience: "audience", notes: "notes" });
  await app.syncNotesOutput([], false);
  assert.equal(app.calls.length, 2);
  app.notesOutputClosed();
  assert.equal(app.notesOutput$.preview.peek(), false);
});
