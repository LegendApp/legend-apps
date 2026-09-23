// @ts-nocheck Bun test globals are provided by the test runner.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSlidesHostClasses } from "./slidesHostClasses";

test("packaged deck compilation retains host classes without host sources", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slides-host-classes-"));
  try {
    fs.mkdirSync(path.join(temp, "apps/slides/src"), { recursive: true });
    fs.writeFileSync(path.join(temp, "apps/slides/src/Counter.tsx"), '<View className="absolute right-3 top-3 text-xs" />');
    const candidates = collectSlidesHostClasses(temp, root);
    fs.rmSync(path.join(temp, "apps"), { recursive: true });
    fs.writeFileSync(path.join(temp, "host-classes.txt"), candidates);
    const cssPath = path.join(root, "shell/src/global.css");
    const { compileVirtual } = await import(path.join(root, "shell/node_modules/uniwind/src/metro/compileVirtual.ts"));
    const baseCss = `@import 'tailwindcss' source(none);\n@import 'uniwind';`;
    const withoutHost = await compileVirtual({ css: baseCss, cssPath, platform: "native", themes: ["light", "dark"], debug: false, polyfills: undefined });
    expect(Function("rt", `return (${withoutHost})`)({}).stylesheet["right-3"]).toBeUndefined();
    const styles = await compileVirtual({
      css: `@import 'tailwindcss' source(none);\n@import 'uniwind';\n@source ${JSON.stringify(path.join(temp, "host-classes.txt"))};`,
      cssPath, platform: "native", themes: ["light", "dark"], debug: false, polyfills: undefined,
    });
    const compiled = Function("rt", `return (${styles})`)({});
    for (const name of ["absolute", "right-3", "top-3", "text-xs"]) {
      expect(compiled.stylesheet[name]).toBeDefined();
    }
    expect(compiled.stylesheet["right-3"][0].entries[0][0]).toBe("right");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
