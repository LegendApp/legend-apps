import { emptyCustomizationHistory, keepCustomizationVersion, parseCustomizationSettingsTextColor, readCustomizationHistory, replayCustomizationChanges, selectCustomizationSettingsTextColor, type DiffCustomizationChange } from "../diffCustomizationModel";

it("accepts only six-digit hex for the constrained Settings text appearance", () => {
  expect(parseCustomizationSettingsTextColor("#58D6C7")).toBe("#58D6C7");
  expect(parseCustomizationSettingsTextColor("red; color: red")).toBeUndefined();
  expect(parseCustomizationSettingsTextColor("#fff")).toBeUndefined();
});

it("selects only validated appearance metadata for the preview or ready active version", () => {
  const colors = new Map([["active", "#58D6C7"], ["preview", "#AABBCC"]]);
  expect(selectCustomizationSettingsTextColor(true, "preview", "active", colors)).toBe("#AABBCC");
  expect(selectCustomizationSettingsTextColor(true, null, "active", colors)).toBe("#58D6C7");
  expect(selectCustomizationSettingsTextColor(false, null, "active", colors)).toBeUndefined();
  expect(selectCustomizationSettingsTextColor(true, "incompatible", "active", colors)).toBeUndefined();
});

const baseline = { baseId: "v1", files: { "diffPalette.ts": "red small" } };
const change = (id: string, before: string, after: string): DiffCustomizationChange => ({
  id, title: id, summary: id, prompt: id, createdAt: 1, enabled: true, edits: [{ path: "diffPalette.ts", before, after }],
});

it("replays saved edits in order without modifying the baseline", () => {
  expect(replayCustomizationChanges(baseline, [change("color", "red", "blue"), change("size", "small", "large")])["diffPalette.ts"]).toBe("blue large");
  expect(baseline.files["diffPalette.ts"]).toBe("red small");
});

it("removes independent edits and rejects a later edit dependent on a removed change", () => {
  const color = change("color", "red", "blue");
  const dependent = change("button", "blue", "green");
  expect(replayCustomizationChanges(baseline, [{ ...color, enabled: false }, change("size", "small", "large")])["diffPalette.ts"]).toBe("red large");
  expect(() => replayCustomizationChanges(baseline, [{ ...color, enabled: false }, dependent])).toThrow("button");
});

it("rejects ambiguous edits and paths outside the editable app", () => {
  expect(() => replayCustomizationChanges({ ...baseline, files: { "diffPalette.ts": "red red" } }, [change("color", "red", "blue")])).toThrow("more than once");
  const invalid = change("escape", "red", "blue");
  invalid.edits[0]!.path = "../SettingsWindow.tsx";
  expect(() => replayCustomizationChanges(baseline, [invalid])).toThrow("unsupported");
});

it("keeps exact compiled snapshots and reads them back without generating code", () => {
  const version = { id: "saved", title: "Color", baseId: "v1", createdAt: 1, code: "saved code", changes: [change("color", "red", "blue")] };
  const history = keepCustomizationVersion(emptyCustomizationHistory(), version);
  expect(readCustomizationHistory(JSON.parse(JSON.stringify(history)))).toEqual(history);
  expect(history.versions[0]!.code).toBe("saved code");
  expect(emptyCustomizationHistory().activeId).toBeNull();
});

it("rejects corrupt history instead of silently losing saved changes", () => {
  expect(() => readCustomizationHistory({ ...emptyCustomizationHistory(), activeId: "missing" })).toThrow("missing");
  expect(() => readCustomizationHistory({ schema: 2 })).toThrow("cannot be read");
});
