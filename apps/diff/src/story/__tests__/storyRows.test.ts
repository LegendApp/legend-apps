import type { DiffSideBySideProjection } from "@legend-apps/diff-parser";
import { buildStoryRows, nextStorySection } from "../storyRows";
import { createStoryReviewStore } from "../storyReview";
import { fixtureInput, fixtureStory, memoryStorage } from "./storyFixtures";

it("orders sections, real hunk rows, compact lists and the mandatory uncovered group", () => {
  const input = fixtureInput();
  const model = buildStoryRows(fixtureStory(), input);
  expect(model.rows[0].type).toBe("section");
  expect(model.sections).toEqual([0]);
  expect(model.coverage).toEqual({ covered: 1, total: 3 });
  expect(model.rows.filter(row => row.type === "hunk").map(row => row.hunk.id)).toEqual(["h1", "h2", "h3"]);
  expect(model.rows.filter(row => row.type === "line").map(row => row.sourceIndex)).toEqual(input.hunks.flatMap(hunk => hunk.rows.map(row => row.index)));
  const last = model.rows.findIndex(row => row.type === "uncovered");
  expect(model.rows.slice(last).filter(row => row.type === "file").map(row => row.path)).toEqual(["src/a.ts", "generated/api.ts"]);
  expect(model.rows.slice(last).some(row => row.type === "section" || row.type === "list")).toBe(false);
});

it("shows only a partial range until expanded, while coverage counts the hunk once", () => {
  const story = fixtureStory([{ hunk: "h1", side: "new", startLine: 41, endLine: 41 }, { hunk: "h1" }]);
  const input = fixtureInput();
  const model = buildStoryRows(story, input);
  const start = model.rows.findIndex(row => row.key === "s1:0");
  expect(model.rows[start]).toMatchObject({ type: "hunk", partial: true, expanded: false });
  expect(model.rows[start + 1]).toMatchObject({ type: "line", sourceIndex: input.hunks[0].rows[2].index });
  expect(model.rows[start + 2].type).toBe("hunk");
  expect(model.coverage.covered).toBe(1);
  const expanded = buildStoryRows(story, input, { expanded: new Set(["s1:0"]) });
  expect(expanded.rows.filter(row => row.key.startsWith("s1:0:")).length).toBe(3);
});

it("maps partial ranges to native side-by-side items without duplicate paired lines", () => {
  const input = fixtureInput();
  const projection = {
    getSourceLocation: (index: number) => ({ listIndex: Math.floor(index / 2) }),
    getItemId: (index: number) => index + 100,
    getItem: (index: number) => ({ itemId: index, kind: "line", hunkStart: true }),
  } as unknown as DiffSideBySideProjection;
  const model = buildStoryRows(fixtureStory([{ hunk: "h1" }]), input, { projection });
  const lines = model.rows.filter(row => row.type === "line" && row.key.startsWith("s1:0:"));
  expect(lines).toHaveLength(2);
  expect(lines.every(row => row.type === "line" && row.item?.hunkStart === false)).toBe(true);
});

it("keeps full coverage explicit and metadata/binary files visible", () => {
  const input = fixtureInput();
  const story = fixtureStory(input.hunks.map(hunk => ({ hunk: hunk.id })));
  expect(buildStoryRows(story, input).rows.at(-1)).toMatchObject({ type: "uncovered", full: true });
  input.files.push({ file: { ...input.files[0].file, index: 9, path: "image.png", isBinary: true }, hunks: [], text: "", classification: "source" });
  const rows = buildStoryRows(story, input).rows;
  expect(rows.find(row => row.type === "uncovered")).toMatchObject({ full: false });
  expect(rows.at(-1)).toMatchObject({ type: "file", path: "image.png", note: "Binary file — no text hunks" });
});

it("persists review marks per diff hash across store recreation and supports unreview", () => {
  const storage = memoryStorage();
  const first = createStoryReviewStore(storage);
  first.setReviewed("sha256:one", "s1", true);
  first.setReviewed("sha256:one", "s1", true);
  const second = createStoryReviewStore(storage);
  second.load("sha256:one"); second.load("sha256:two");
  expect(second.reviewed$["sha256:one"].peek()).toEqual(["s1"]);
  expect(second.reviewed$["sha256:two"].peek()).toEqual([]);
  second.setReviewed("sha256:one", "s1", false);
  expect(second.reviewed$["sha256:one"].peek()).toEqual([]);
});

it("bounds section shortcut navigation", () => {
  expect(nextStorySection([0, 5], -1, 1)).toBe(0);
  expect(nextStorySection([0, 5], 0, 1)).toBe(1);
  expect(nextStorySection([0, 5], 1, 1)).toBe(1);
  expect(nextStorySection([0, 5], 0, -1)).toBe(0);
  expect(nextStorySection([], 0, 1)).toBe(-1);
});
