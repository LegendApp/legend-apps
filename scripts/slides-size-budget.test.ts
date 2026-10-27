// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appSizes, linkMapSummary } from "./slides-size-budget";

test("size components partition regular files without following framework symlinks", () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "slides-size-"));
  try {
    for (const file of ["MacOS/Slides", "Resources/main.jsbundle", "Frameworks/hermes.framework/Versions/0/hermes", "Resources/Assets.car", "Helpers/compiler/run", "Info.plist"]) {
      const target = path.join(app, "Contents", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "1234");
    }
    fs.symlinkSync("0", path.join(app, "Contents/Frameworks/hermes.framework/Versions/Current"));
    expect(appSizes(app)).toEqual({ logicalBytes: 24, components: { executable: 4, jsBundle: 4, frameworks: 4, assets: 4, helpers: 4, metadata: 4 } });
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
});

test("link map attributes live symbols to libraries and excludes dead symbols", () => {
  const summary = linkMapSummary("# Object files:\n[ 1] /build/libSkia.a[2](A.o)\n[ 2] /build/libSkia.a[3](B.o)\n# Sections:\n# Address Size Segment Section\n# Symbols:\n# Address Size File Name\n0x1000 0x20 [ 1] _a\n0x1020 0x10 [ 2] _b\n# Dead Stripped Symbols:\n<<dead>> 0x1000 [ 1] _unused\n");
  expect(summary.linkedSymbolBytes).toBe(48);
  expect(summary.libraries).toEqual([{ name: "libSkia.a", bytes: 48 }]);
  expect(summary.largestSymbols.map(symbol => symbol.name)).toEqual(["_a", "_b"]);
  expect(() => linkMapSummary("# Symbols:\n")).toThrow("No live symbols");
});

test("CLI checks compressed download budgets and refuses to overwrite artifacts", () => {
  if (process.platform !== "darwin") return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-budget-"));
  try {
    const app = path.join(root, "Slides.app");
    fs.mkdirSync(path.join(app, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(app, "Contents/Info.plist"), "fixture");
    const zip = path.join(root, "app.zip");
    const command = [process.execPath, path.join(import.meta.dirname, "slides-size-budget.ts"), app, "--zip", zip];
    const exceeded = Bun.spawnSync([...command, "--budget-mb", "0.000001"]);
    expect(exceeded.exitCode).toBe(1);
    expect(JSON.parse(exceeded.stdout.toString()).passed).toBe(false);
    const bytes = fs.readFileSync(zip);
    expect(Bun.spawnSync(command).exitCode).toBe(1);
    expect(fs.readFileSync(zip)).toEqual(bytes);
    fs.unlinkSync(zip);
    const passed = Bun.spawnSync(command);
    expect(passed.exitCode).toBe(0);
    expect(JSON.parse(passed.stdout.toString()).passed).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
