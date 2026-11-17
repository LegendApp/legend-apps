import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "@legend-apps/git-core";
import { fixtureGit } from "../../../../packages/git-core/test/fixtures/make-repos";
import { realRunner } from "../../../../packages/git-core/test/fixtures/realRunner";
import { addRecent, createRecents, maxRecentRepositories, recentLabels } from "../gitRecents";

function memoryBackend(saved: string[] = []) {
  let value = [...saved];
  const backend = {
    list: jest.fn(async () => [...value]),
    note: jest.fn(async (path: string) => { value = [path, ...value.filter(item => item !== path)]; }),
  };
  return { backend, saved: () => value, get: () => backend };
}

it("puts the newest first, drops duplicates and keeps ten", () => {
  let list: string[] = [];
  for (let index = 0; index < 12; index += 1) list = addRecent(list, `/repos/r${index}`);
  expect(list).toHaveLength(maxRecentRepositories);
  expect(list[0]).toBe("/repos/r11");
  expect(list.at(-1)).toBe("/repos/r2");
  expect(addRecent(list, "/repos/r5/")).toEqual(["/repos/r5", ...list.filter(path => path !== "/repos/r5")]);
});

it("labels recents by folder, adding the parent where names repeat", () => {
  expect(recentLabels(["/a/app", "/b/app", "/b/lib"])).toEqual(["app — a", "app — b", "lib"]);
});

it("loads the saved recents, applies changes after the load in order, and passes each change on", async () => {
  const memory = memoryBackend(["/old", "/older"]);
  const recents = createRecents(memory.get);
  const listener = jest.fn();
  // A note made before the load finishes lands on top of the saved list.
  void recents.note("/new");
  recents.subscribe(listener);
  await recents.settled();
  expect(recents.get()).toEqual(["/new", "/old", "/older"]);
  expect(memory.saved()).toEqual(["/new", "/old", "/older"]);
  await recents.note("/old");
  expect(recents.get()).toEqual(["/old", "/new", "/older"]);
  expect(listener).toHaveBeenCalled();
});

it("shows the newest ten of a longer saved list", async () => {
  const recents = createRecents(memoryBackend(Array.from({ length: 20 }, (_, index) => `/r${index}`)).get);
  await recents.settled();
  expect(recents.get()).toEqual(Array.from({ length: 10 }, (_, index) => `/r${index}`));
});

describe("real repositories", () => {
  let root: string;
  beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-recents-"))); });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("dedupes a repository opened through a subfolder and a symbolic link by Git's resolved root", async () => {
    const repo = join(root, "repo"), other = join(root, "other");
    for (const path of [repo, other]) { mkdirSync(path); fixtureGit(path, "init", "-q"); }
    mkdirSync(join(repo, "src"));
    symlinkSync(repo, join(root, "link"));
    const recents = createRecents(memoryBackend().get);
    for (const path of [repo, other, join(repo, "src"), join(root, "link")]) {
      await recents.note(await new GitService(path, realRunner).resolveRoot());
    }
    expect(recents.get()).toEqual([repo, other]);
  });
});
