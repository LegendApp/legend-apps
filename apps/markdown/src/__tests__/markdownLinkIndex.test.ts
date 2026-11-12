import { getNewNotePath, linkMention, parseFrontmatterAliases, parseNoteLinks, parseNoteLinkUrl, VaultLinkIndex } from "../markdownLinkIndex";
import { scanVault, updateVaultPath } from "../useVaultLinkIndex";

const tree: Record<string, string | null> = {};

jest.mock("@legendapp/spark/files", () => ({
  list: jest.fn(async (directory: string) => Object.keys(tree)
    .filter(path => path.startsWith(`${directory}/`) && !path.slice(directory.length + 1).includes("/"))
    .sort()
    .map(path => ({ name: path.slice(directory.length + 1), path }))),
  readText: jest.fn(async (path: string) => {
    if (typeof tree[path] !== "string") throw new Error(`missing ${path}`);
    return tree[path];
  }),
  stat: jest.fn(async (path: string) => ({ type: tree[path] === null ? "directory" : "file" })),
  watch: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));

function setTree(files: Record<string, string | null>) {
  for (const key of Object.keys(tree)) delete tree[key];
  Object.assign(tree, files);
}

describe("parseNoteLinks", () => {
  it("parses wikilinks, aliases, headings, block refs, embeds and relative Markdown links", () => {
    const text = "See [[Note]], [[Note|alias]], [[Note#Heading]], [[Note#^abc]], ![[Pic note]] and [x](../Other%20note.md#Part).";
    expect(parseNoteLinks(text).map(({ embed, kind, subpath, target }) => ({ embed, kind, subpath, target }))).toEqual([
      { embed: false, kind: "wiki", subpath: null, target: "Note" },
      { embed: false, kind: "wiki", subpath: null, target: "Note" },
      { embed: false, kind: "wiki", subpath: "Heading", target: "Note" },
      { embed: false, kind: "wiki", subpath: "^abc", target: "Note" },
      { embed: true, kind: "wiki", subpath: null, target: "Pic note" },
      { embed: false, kind: "markdown", subpath: "Part", target: "../Other note.md" },
    ]);
  });

  it("skips code, frontmatter, self links and external URLs", () => {
    const text = "---\nup: \"[[Front]]\"\n---\n`[[Inline]]` [[#Self]] [site](https://x.md)\n```md\n[[Fenced]]\n```\n~~~\n[[Tilde]]\n~~~\n[[Real]]";
    expect(parseNoteLinks(text).map(link => link.target)).toEqual(["Real"]);
  });
});

describe("VaultLinkIndex.resolve", () => {
  const index = new VaultLinkIndex("/vault");
  for (const path of ["/vault/Note.md", "/vault/a/Note.md", "/vault/a/b/Deep.md", "/vault/x/Deep.md", "/vault/x/y/z/Deep.md", "/vault/a/Same.md", "/vault/Same.md"]) index.set(path, "");

  it("matches the title case-insensitively with an optional extension", () => {
    expect(index.resolve({ kind: "wiki", target: "note" }, "/vault/c.md")).toBe("/vault/Note.md");
    expect(index.resolve({ kind: "wiki", target: "Note.md" }, "/vault/c.md")).toBe("/vault/Note.md");
  });

  it("prefers the exact vault path, then the linking folder, then the shortest path", () => {
    expect(index.resolve({ kind: "wiki", target: "a/Note" }, "/vault/c.md")).toBe("/vault/a/Note.md");
    expect(index.resolve({ kind: "wiki", target: "Same" }, "/vault/a/c.md")).toBe("/vault/Same.md");
    expect(index.resolve({ kind: "wiki", target: "Note" }, "/vault/a/c.md")).toBe("/vault/Note.md");
    expect(index.resolve({ kind: "wiki", target: "b/Deep" }, "/vault/c.md")).toBe("/vault/a/b/Deep.md");
    expect(index.resolve({ kind: "wiki", target: "Deep" }, "/vault/c.md")).toBe("/vault/x/Deep.md");
    expect(index.resolve({ kind: "wiki", target: "Missing" }, "/vault/c.md")).toBeNull();
  });

  it("resolves Markdown links relative to the linking note", () => {
    expect(index.resolve({ kind: "markdown", target: "../Note.md" }, "/vault/a/c.md")).toBe("/vault/Note.md");
    expect(index.resolve({ kind: "markdown", target: "b/deep.md" }, "/vault/a/c.md")).toBe("/vault/a/b/Deep.md");
    expect(index.resolve({ kind: "markdown", target: "/x/Deep.md" }, "/vault/a/c.md")).toBe("/vault/x/Deep.md");
    expect(index.resolve({ kind: "markdown", target: "Deep.md" }, "/vault/a/c.md")).toBeNull();
  });
});

describe("pressed note links", () => {
  it("reads relative Markdown paths and scheme-less targets as note links", () => {
    expect(parseNoteLinkUrl("../My%20Note.md#Part")).toEqual({ kind: "markdown", subpath: "Part", target: "../My Note.md" });
    expect(parseNoteLinkUrl("Note#Heading")).toEqual({ kind: "wiki", subpath: "Heading", target: "Note" });
    expect(parseNoteLinkUrl("https://x.dev/a.md")).toBeNull();
    expect(parseNoteLinkUrl("mailto:a@b.c")).toBeNull();
    expect(parseNoteLinkUrl("#Heading")).toBeNull();
  });

  it("creates missing notes beside the linking note, or vault-relative for a wikilink path", () => {
    expect(getNewNotePath("/vault", { kind: "markdown", target: "../New.md" }, "/vault/a/b/c.md")).toBe("/vault/a/New.md");
    expect(getNewNotePath("/vault", { kind: "wiki", target: "New" }, "/vault/a/c.md")).toBe("/vault/a/New.md");
    expect(getNewNotePath("/vault", { kind: "wiki", target: "dir/New.md" }, "/vault/a/c.md")).toBe("/vault/dir/New.md");
  });
});

describe("VaultLinkIndex.linkedMentions", () => {
  it("groups links by source with their line context", () => {
    const index = new VaultLinkIndex("/vault");
    index.set("/vault/Target.md", "# Target");
    index.set("/vault/b.md", "intro\nSee [[target]] and ![[Target#H]].\n`[[Target]]`");
    index.set("/vault/a.md", "[t](Target.md)");
    index.set("/vault/c.md", "[[Other]]");
    expect(index.linkedMentions("/vault/Target.md")).toEqual([
      { mentions: [{ context: "[t](Target.md)", contextStart: 0, end: 14, start: 0, text: "[t](Target.md)" }], source: "/vault/a.md" },
      { mentions: [
        { context: "See [[target]] and ![[Target#H]].", contextStart: 6, end: 20, start: 10, text: "[[target]]" },
        { context: "See [[target]] and ![[Target#H]].", contextStart: 6, end: 38, start: 25, text: "![[Target#H]]" },
      ], source: "/vault/b.md" },
    ]);
    index.delete("/vault/b.md");
    expect(index.linkedMentions("/vault/Target.md").map(group => group.source)).toEqual(["/vault/a.md"]);
  });
});

describe("unlinked mentions", () => {
  it("reads frontmatter aliases as inline lists, block lists or single values", () => {
    expect(parseFrontmatterAliases("---\naliases: [One, \"Two\"]\n---\n")).toEqual(["One", "Two"]);
    expect(parseFrontmatterAliases("---\ntags: x\naliases:\n  - One\n  - 'Two'\nother: y\n---")).toEqual(["One", "Two"]);
    expect(parseFrontmatterAliases("---\nalias: Solo\n---")).toEqual(["Solo"]);
    expect(parseFrontmatterAliases("aliases: [Not frontmatter]")).toEqual([]);
  });

  it("finds whole-word title and alias text outside links, code and URLs", () => {
    const index = new VaultLinkIndex("/vault");
    index.set("/vault/Project X.md", "---\naliases: [PX]\n---\nProject X mentions itself.");
    index.set("/vault/a.md", "About project x and PX.\n[[Project X]] `Project X` Project Xylophone https://px.dev/Project-X [Project X](https://x.dev)");
    index.set("/vault/b.md", "nothing here");
    expect(index.unlinkedMentions("/vault/Project X.md")).toEqual([{
      mentions: [
        { context: "About project x and PX.", contextStart: 0, end: 15, start: 6, text: "project x" },
        { context: "About project x and PX.", contextStart: 0, end: 22, start: 20, text: "PX" },
      ],
      source: "/vault/a.md",
    }]);
  });

  it("links a mention with the title, keeping other wording as the alias", () => {
    expect(linkMention("See Note now", { end: 8, start: 4, text: "Note" }, "Note")).toBe("See [[Note]] now");
    expect(linkMention("See note now", { end: 8, start: 4, text: "note" }, "Note")).toBe("See [[Note|note]] now");
    expect(linkMention("Changed", { end: 8, start: 4, text: "Note" }, "Note")).toBeNull();
  });
});

describe("scanVault", () => {
  it("indexes Markdown notes the sidebar would show and updates them from watch events", async () => {
    setTree({
      "/vault": null,
      "/vault/.gitignore": "private/",
      "/vault/Target.md": "",
      "/vault/a.md": "[[Target]]",
      "/vault/notes": null,
      "/vault/notes/b.md": "[[Target]]",
      "/vault/notes/image.png": "",
      "/vault/private": null,
      "/vault/private/c.md": "[[Target]]",
      "/vault/node_modules": null,
      "/vault/node_modules/d.md": "[[Target]]",
    });
    const { index, scopes } = await scanVault("/vault");
    expect([...index.paths()].sort()).toEqual(["/vault/Target.md", "/vault/a.md", "/vault/notes/b.md"]);

    tree["/vault/notes/b.md"] = "nothing";
    tree["/vault/notes/e.md"] = "[[Target]]";
    delete tree["/vault/a.md"];
    expect(await updateVaultPath(index, scopes, "/vault/notes/b.md")).toBe(true);
    expect(await updateVaultPath(index, scopes, "/vault/notes")).toBe(true);
    expect(await updateVaultPath(index, scopes, "/vault/a.md")).toBe(true);
    expect(index.linkedMentions("/vault/Target.md").map(group => group.source)).toEqual(["/vault/notes/e.md"]);

    expect(await updateVaultPath(index, scopes, "/vault/private/c.md")).toBe(true);
    expect(index.getText("/vault/private/c.md")).toBeUndefined();
    expect(await updateVaultPath(index, scopes, "/vault/node_modules/x/y.md")).toBe(true);
    expect(await updateVaultPath(index, scopes, "/vault/new/f.md")).toBe(false);
    expect(await updateVaultPath(index, scopes, "/vault/.gitignore")).toBe(false);
  });

  it("indexes a few thousand notes quickly", async () => {
    const files: Record<string, string | null> = { "/vault": null };
    for (let folder = 0; folder < 40; folder++) {
      files[`/vault/f${folder}`] = null;
      for (let note = 0; note < 75; note++) files[`/vault/f${folder}/n${note}.md`] = `# N${note}\nSee [[n${(note + 1) % 75}]] and [[Hub]].\n`;
    }
    files["/vault/Hub.md"] = "";
    setTree(files);
    const started = Date.now();
    const { index } = await scanVault("/vault");
    const groups = index.linkedMentions("/vault/Hub.md");
    expect(index.size).toBe(3001);
    expect(groups).toHaveLength(3000);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
