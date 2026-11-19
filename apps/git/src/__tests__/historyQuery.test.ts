import type { GitRefDecoration, GitSearchCommit } from "@legend-apps/git-core";
import { historySearch, matchesHistoryQuery, parseHistoryQuery } from "../historyQuery";

const head = "a".repeat(40), mainOid = "b".repeat(40), tagOid = "c".repeat(40);
const refs = new Map<string, GitRefDecoration[]>([[mainOid, [{ kind: "branch", name: "main" }, { kind: "remote", name: "origin/main" }]], [tagOid, [{ kind: "tag", name: "v1.0" }]]]);

const commit = (overrides: Partial<GitSearchCommit> = {}): GitSearchCommit => ({
  oid: "1234abcd".padEnd(40, "0"), parents: [], authorName: "Jay Meistrich", authorEmail: "jay@example.test", time: 0, summary: "fix: list scroll",
  status: "", path: "", oldPath: null, message: "fix: list scroll\n\nKeeps the anchor.", committerName: "GitHub", committerEmail: "noreply@github.com", refs: ["main"], ...overrides,
});
const matches = (text: string, overrides?: Partial<GitSearchCommit>) => matchesHistoryQuery(parseHistoryQuery(text), commit(overrides));

describe("parseHistoryQuery", () => {
  it("splits free words and GitHub-style qualifiers, with quotes and negation", () => {
    const query = parseHistoryQuery(`scroll author:jmeistrich -author:bot path:src/app "exact phrase" author:"Jay M" -wip message:"keeps the" sha:1234ab branch:main -ref:v1.0 content:NEEDLE`);
    expect(query.words).toEqual([{ value: "scroll", negate: false }, { value: "exact phrase", negate: false }, { value: "wip", negate: true }]);
    expect(query.fields.author).toEqual([{ value: "jmeistrich", negate: false }, { value: "bot", negate: true }, { value: "Jay M", negate: false }]);
    expect(query.fields).toMatchObject({
      path: [{ value: "src/app", negate: false }], message: [{ value: "keeps the", negate: false }], sha: [{ value: "1234ab", negate: false }],
      ref: [{ value: "main", negate: false }, { value: "v1.0", negate: true }], content: [{ value: "NEEDLE", negate: false }],
    });
    expect(query.errors).toEqual([]);
  });

  it("keeps unknown or empty qualifiers as words, so commit subjects like “fix:” stay searchable", () => {
    expect(parseHistoryQuery("fix: scroll a:b").words.map(term => term.value)).toEqual(["fix:", "scroll", "a:b"]);
    expect(parseHistoryQuery("Author:Jay file:README").fields).toMatchObject({ author: [{ value: "Jay" }], path: [{ value: "README" }] });
    expect(parseHistoryQuery("   ").words).toEqual([]);
  });

  it("reads dates and reports what can't run", () => {
    expect(parseHistoryQuery("before:2026-11-01 since:2026-10-01")).toMatchObject({ before: "2026-11-01", after: "2026-10-01", errors: [] });
    expect(parseHistoryQuery("before:yesterday").errors).toEqual(["before: needs a date like 2026-11-01."]);
    expect(parseHistoryQuery("-after:2026-01-01").errors).toHaveLength(1);
    expect(parseHistoryQuery("sha:xyz").errors).toEqual(["sha: needs hexadecimal digits, not “xyz”."]);
    expect(parseHistoryQuery("content:a content:b").errors).toEqual(["Only one content: term per search."]);
  });
});

describe("matchesHistoryQuery", () => {
  it("matches each free word in any field: message body, author or committer name and email, SHA prefix, ref names", () => {
    expect(matches("anchor")).toBe(true);
    expect(matches("meistrich")).toBe(true);
    expect(matches("example.test")).toBe(true);
    expect(matches("noreply")).toBe(true);
    expect(matches("1234ab")).toBe(true);
    expect(matches("main")).toBe(true);
    expect(matches("SCROLL anchor")).toBe(true);
    // Words AND together, and a negated word leaves matches out.
    expect(matches("scroll missing")).toBe(false);
    expect(matches("scroll -anchor")).toBe(false);
    expect(matches("\"list scroll\"")).toBe(true);
  });

  it("checks qualifiers git can't negate, and OR within one qualifier", () => {
    expect(matches("author:jay")).toBe(true);
    expect(matches("author:ann author:jay")).toBe(true);
    expect(matches("-author:jay")).toBe(false);
    expect(matches("committer:github -committer:jay")).toBe(true);
    expect(matches("message:anchor -message:revert")).toBe(true);
    expect(matches("message:anchor message:revert")).toBe(false);
    expect(matches("sha:1234")).toBe(true);
    expect(matches("sha:ffff")).toBe(false);
    expect(matches("-sha:1234")).toBe(false);
  });
});

describe("historySearch", () => {
  it("pushes author, committer, message, dates, content and paths into git, and walks from HEAD", () => {
    const { search, error } = historySearch(parseHistoryQuery("author:jay committer:bot message:fix message:list before:2026-11-01 after:2026-10-01 path:src -path:docs content:NEEDLE"), head, refs);
    expect(error).toBeNull();
    expect(search).toMatchObject({
      revisions: [head],
      options: ["--regexp-ignore-case", "--fixed-strings", "--author=jay", "--committer=bot", "--grep=fix", "--grep=list", "--all-match", "-SNEEDLE", "--since=2026-10-01 00:00:00", "--until=2026-11-01 00:00:00"],
      paths: [":(icase)*src*", ":(exclude,icase)*docs*"],
    });
    // Only what git filtered: no commit test, so git pages on its own.
    expect(search!.match).toBeUndefined();
  });

  it("adds a commit test for free words, SHAs and negated people or messages", () => {
    for (const text of ["scroll", "sha:12", "-author:bot", "-message:wip"]) expect(historySearch(parseHistoryQuery(text), head, refs).search!.match).toBeInstanceOf(Function);
    const { search } = historySearch(parseHistoryQuery("scroll"), head, refs);
    expect(search).toMatchObject({ revisions: [head], options: [], paths: [] });
    expect(search!.match!(commit())).toBe(true);
    expect(search!.match!(commit({ message: "docs", summary: "docs" }))).toBe(false);
  });

  it("walks from named branches and tags instead of HEAD, and leaves negated ones' commits out", () => {
    expect(historySearch(parseHistoryQuery("branch:main"), head, refs).search!.revisions).toEqual([mainOid]);
    expect(historySearch(parseHistoryQuery("ref:origin/main tag:v1.0"), head, refs).search!.revisions).toEqual([mainOid, tagOid]);
    expect(historySearch(parseHistoryQuery("-branch:MAIN"), head, refs).search!.revisions).toEqual([head, `^${mainOid}`]);
    expect(historySearch(parseHistoryQuery("branch:nope"), head, refs)).toEqual({ search: null, error: "No branch or tag named “nope”." });
    expect(historySearch(parseHistoryQuery("before:soon"), head, refs).error).toBe("before: needs a date like 2026-11-01.");
  });

  it("escapes glob characters in paths", () => {
    expect(historySearch(parseHistoryQuery("path:a*b?[c]"), head, refs).search!.paths).toEqual([":(icase)*a\\*b\\?\\[c]*"]);
  });
});
