import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportWebsite, exportDebugDirectory } from "../export";

test("offscreen exports preserve deck files without retaining debug maps", async () => {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-render-export-test-")));
  const output = path.join(temporary, "player");
  try {
    const source = path.join(temporary, "source");
    await fs.mkdir(source);
    const deck = path.join(source, "sample.mdx");
    const content = 'import { World, Box } from "slides:world/World"\n\n<World width={640} height={360}><Box /></World>';
    await fs.writeFile(deck, content);
    const before = await fs.stat(deck);
    await exportWebsite(deck, output, { offscreen: true });
    expect(await fs.readFile(deck, "utf8")).toBe(content);
    expect((await fs.stat(deck)).mtimeMs).toBe(before.mtimeMs);
    expect(await fs.readdir(source)).toEqual(["sample.mdx"]);
    expect((await fs.stat(path.join(output, "player.js"))).size).toBeGreaterThan(0);
    expect(await fs.stat(exportDebugDirectory(output)).catch(() => null)).toBe(null);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
    await fs.rm(exportDebugDirectory(output), { recursive: true, force: true });
  }
}, 30000);
