// @ts-nocheck Bun test types are not included in the app TypeScript configuration.
import { expect, test } from "bun:test";
import type { Storage } from "@legend-apps/storage";
import { syncTransitionLibrary } from "../transitionLibraryPolicy";
import { builtinTransitionSources } from "../../../../packages/presentation/src/transitions";

test("seeds once, updates unmodified copies, preserves user edits, and does not write on ordinary reloads", () => {
  const files = new Map<string, unknown>(); let writes = 0;
  const storage = { ensureDirectory: () => ({ uri: "file:///test/transitions" }), read: (file: string) => files.get(file),
    write: (file: string, value: unknown) => { writes++; files.set(file, value); } } as unknown as Storage;
  syncTransitionLibrary(storage);
  const seededWrites = writes;
  syncTransitionLibrary(storage);
  expect(writes).toBe(seededWrites);
  files.set("transitions/fade.ts", "user-edited");
  files.set("transitions/slide.ts", "old-source");
  files.set("transitions/.installed.json", { ...builtinTransitionSources, slide: "old-source" });
  syncTransitionLibrary(storage);
  expect(files.get("transitions/fade.ts")).toBe("user-edited");
  expect(files.get("transitions/slide.ts")).toBe(builtinTransitionSources.slide);
});
