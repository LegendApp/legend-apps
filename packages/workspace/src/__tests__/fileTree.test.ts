import { flattenWorkspaceTree, listWorkspaceDirectory } from "../fileTree";

const tree: Record<string, string | null> = {
  "/repo": null,
  "/repo/.gitignore": "dist/\n*.log",
  "/repo/node_modules": null,
  "/repo/dist": null,
  "/repo/src": null,
  "/repo/src/.gitignore": "generated.ts",
  "/repo/src/generated.ts": "",
  "/repo/src/index.ts": "",
  "/repo/src/debug.log": "",
  "/repo/README.md": "",
};

jest.mock("@legendapp/spark/files", () => ({
  list: jest.fn(async (directory: string) => Object.keys(tree)
    .filter(path => path.startsWith(`${directory}/`) && !path.slice(directory.length + 1).includes("/"))
    .sort()
    .map(path => ({ name: path.slice(directory.length + 1), path }))),
  readText: jest.fn(async (path: string) => tree[path]),
  stat: jest.fn(async (path: string) => ({ type: tree[path] === null ? "directory" : "file" })),
}));

describe("listWorkspaceDirectory", () => {
  it("lists directories first and hides ignored entries", async () => {
    const root = await listWorkspaceDirectory("/repo");
    expect(root.entries.map(entry => entry.name)).toEqual(["src", ".gitignore", "README.md"]);
  });

  it("combines parent and nested .gitignore scopes", async () => {
    const root = await listWorkspaceDirectory("/repo");
    const src = await listWorkspaceDirectory("/repo/src", root.scopes);
    expect(src.entries.map(entry => entry.name)).toEqual([".gitignore", "index.ts"]);
    expect(src.scopes.map(scope => scope.base)).toEqual(["/repo", "/repo/src"]);
  });
});

describe("flattenWorkspaceTree", () => {
  it("keeps row paths unique when added files and folders overlap", async () => {
    const root = await listWorkspaceDirectory("/repo");
    const src = await listWorkspaceDirectory("/repo/src", root.scopes);
    const listings = new Map([["/repo", root], ["/repo/src", src]]);
    const roots = [
      { isDirectory: true, name: "repo", path: "/repo" },
      { isDirectory: true, name: "src", path: "/repo/src" },
      { isDirectory: false, name: "index.ts", path: "/repo/src/index.ts" },
    ];
    expect(flattenWorkspaceTree(roots, listings, new Set(["/repo", "/repo/src"])).map(row => row.path)).toEqual([
      "/repo", "/repo/src", "/repo/src/.gitignore", "/repo/src/index.ts", "/repo/.gitignore", "/repo/README.md",
    ]);
    expect(flattenWorkspaceTree(roots, listings, new Set(["/repo/src"])).map(row => row.path)).toEqual([
      "/repo", "/repo/src", "/repo/src/.gitignore", "/repo/src/index.ts",
    ]);
  });

  it("emits rows for expanded directories only", async () => {
    const root = await listWorkspaceDirectory("/repo");
    const listings = new Map([["/repo", root]]);
    const roots = [{ isDirectory: true, name: "repo", path: "/repo" }, { isDirectory: false, name: "a.md", path: "/x/a.md" }];

    expect(flattenWorkspaceTree(roots, listings, new Set()).map(row => row.path)).toEqual(["/repo", "/x/a.md"]);
    expect(flattenWorkspaceTree(roots, listings, new Set(["/repo"])).map(row => [row.path, row.depth, row.parent])).toEqual([
      ["/repo", 0, null],
      ["/repo/src", 1, "/repo"],
      ["/repo/.gitignore", 1, "/repo"],
      ["/repo/README.md", 1, "/repo"],
      ["/x/a.md", 0, null],
    ]);
  });
});
