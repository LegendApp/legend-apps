import { isIgnored, parseGitignore } from "../gitignore";

function ignores(text: string, path: string, isDirectory = false) {
  return isIgnored([{ base: "/repo", rules: parseGitignore(text) }], `/repo/${path}`, isDirectory);
}

describe("gitignore", () => {
  it("always hides git metadata and node_modules", () => {
    expect(isIgnored([], "/repo/node_modules", true)).toBe(true);
    expect(isIgnored([], "/repo/packages/a/.git", true)).toBe(true);
    expect(isIgnored([], "/repo/src", true)).toBe(false);
  });

  it("matches unanchored names at any depth", () => {
    expect(ignores("*.log", "debug.log")).toBe(true);
    expect(ignores("*.log", "a/b/debug.log")).toBe(true);
    expect(ignores("*.log", "a/b/debug.txt")).toBe(false);
    expect(ignores("build", "a/build", true)).toBe(true);
  });

  it("anchors patterns containing a slash", () => {
    expect(ignores("/dist", "dist", true)).toBe(true);
    expect(ignores("/dist", "a/dist", true)).toBe(false);
    expect(ignores("docs/*.md", "docs/a.md")).toBe(true);
    expect(ignores("docs/*.md", "docs/sub/a.md")).toBe(false);
  });

  it("supports double-star segments", () => {
    expect(ignores("**/cache", "a/b/cache", true)).toBe(true);
    expect(ignores("logs/**", "logs/a/b.txt")).toBe(true);
    expect(ignores("a/**/z", "a/z")).toBe(true);
    expect(ignores("a/**/z", "a/b/c/z")).toBe(true);
  });

  it("applies directory-only patterns to directories", () => {
    expect(ignores("out/", "out", true)).toBe(true);
    expect(ignores("out/", "out", false)).toBe(false);
  });

  it("lets later negations re-include paths", () => {
    expect(ignores("*.env\n!example.env", "example.env")).toBe(false);
    expect(ignores("*.env\n!example.env", "prod.env")).toBe(true);
  });

  it("skips comments, blanks, and escapes", () => {
    expect(ignores("# note\n\n\\#keep", "#keep")).toBe(true);
    expect(ignores("# note", "# note")).toBe(false);
    expect(ignores("file?.[ch]", "file1.c")).toBe(true);
    expect(ignores("file[!0-9].c", "file1.c")).toBe(false);
  });

  it("matches nested scopes relative to their own directory", () => {
    const scopes = [
      { base: "/repo", rules: parseGitignore("*.tmp") },
      { base: "/repo/pkg", rules: parseGitignore("/gen\n!keep.tmp") },
    ];
    expect(isIgnored(scopes, "/repo/pkg/gen", true)).toBe(true);
    expect(isIgnored(scopes, "/repo/gen", true)).toBe(false);
    expect(isIgnored(scopes, "/repo/pkg/keep.tmp", false)).toBe(false);
    expect(isIgnored(scopes, "/repo/other/keep.tmp", false)).toBe(true);
  });
});
