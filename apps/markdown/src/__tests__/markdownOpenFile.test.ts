import { findOpenFileResults } from "../markdownOpenFile";

const folders = ["/a/notes", "/b/work"];
const files = ["/a/notes/todo.md", "/a/notes/deep/nested/plan.md", "/b/work/todo.md", "/b/work/plans/q4.md", "/b/work/readme.md"];

describe("findOpenFileResults", () => {
  it("lists up to ten recent files in scope, newest first, at an empty query", () => {
    const recents = ["/b/work/todo.md", "/elsewhere/x.md", "/a/notes/deep/nested/plan.md"];
    expect(findOpenFileResults(files, folders, recents, " ")).toEqual([
      { directory: "work", name: "todo.md", path: "/b/work/todo.md" },
      { directory: "notes/deep/nested", name: "plan.md", path: "/a/notes/deep/nested/plan.md" },
    ]);
    const many = Array.from({ length: 12 }, (_, index) => `/a/notes/${index}.md`);
    expect(findOpenFileResults(many, folders, many, "")).toHaveLength(10);
  });

  it("searches every root, telling same-named files apart by folder", () => {
    expect(findOpenFileResults(files, folders, [], "todo")).toEqual([
      { directory: "notes", name: "todo.md", path: "/a/notes/todo.md" },
      { directory: "work", name: "todo.md", path: "/b/work/todo.md" },
    ]);
  });

  it("ranks names starting with the query first, then names holding it, then recent files", () => {
    expect(findOpenFileResults(files, folders, ["/b/work/plans/q4.md"], "plan").map(result => result.path))
      .toEqual(["/a/notes/deep/nested/plan.md", "/b/work/plans/q4.md"]);
    expect(findOpenFileResults(files, folders, ["/b/work/todo.md"], "work todo").map(result => result.path)).toEqual(["/b/work/todo.md"]);
    expect(findOpenFileResults(files, folders, [], "missing")).toEqual([]);
  });
});
