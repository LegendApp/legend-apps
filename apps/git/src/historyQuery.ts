import type { GitHistoryQuery, GitRefDecoration, GitSearchCommit } from "@legend-apps/git-core";

/**
 * History search text, GitHub style: free words match a commit's message, author, committer, SHA or branch and tag
 * names, all of them (AND); qualifiers narrow one field. A qualifier's values OR together (`author:a author:b`), a
 * leading `-` negates a word or qualifier, and quotes keep spaces (`author:"Jay M"`, `"exact phrase"`).
 */
export type QueryTerm = { value: string; negate: boolean };
export type QueryField = "author" | "committer" | "message" | "sha" | "path" | "ref" | "content";
export type HistoryQuery = {
  words: QueryTerm[];
  fields: Record<QueryField, QueryTerm[]>;
  /** YYYY-MM-DD: commits from before that day / from that day on (committer date, as git's --until/--since). */
  before: string | null;
  after: string | null;
  errors: string[];
};

const qualifiers: Record<string, QueryField | "before" | "after"> = {
  author: "author", committer: "committer", message: "message", msg: "message",
  sha: "sha", hash: "sha", commit: "sha", path: "path", file: "path",
  ref: "ref", branch: "ref", tag: "ref", content: "content",
  before: "before", until: "before", after: "after", since: "after",
};

/** One-line syntax help, for the search field's placeholder and the docs. */
export const historyQueryHint = "Search, or author:name path:src";
export const historyQueryQualifiers = [
  ["author:name", "Author name or email (author:jay, author:\"Jay M\")."],
  ["committer:name", "Committer name or email."],
  ["message:text", "Commit message (subject and body)."],
  ["sha:abc123", "Commit SHA prefix (also hash:, commit:)."],
  ["path:src/app", "A changed file's path contains the text (also file:)."],
  ["branch:main", "Commits reachable from a branch or tag (also ref:, tag:); -branch:main leaves out its commits."],
  ["content:text", "Added or removed text (git log -S); one per search."],
  ["before:2026-11-01", "Committed before that day."],
  ["after:2026-10-01", "Committed on or after that day."],
] as const;

/** Splits on spaces outside quotes; `name:"a b"` and `"a b"` stay one token, without their quotes. */
function tokens(input: string): { text: string; quoted: boolean }[] {
  const out: { text: string; quoted: boolean }[] = [];
  const pattern = /(-?(?:[A-Za-z]+:)?)"([^"]*)"?|\S+/g;
  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    if (match[2] !== undefined) out.push({ text: match[1] + match[2], quoted: true });
    else out.push({ text: match[0], quoted: false });
  }
  return out;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseHistoryQuery(input: string): HistoryQuery {
  const query: HistoryQuery = { words: [], fields: { author: [], committer: [], message: [], sha: [], path: [], ref: [], content: [] }, before: null, after: null, errors: [] };
  for (const { text, quoted } of tokens(input)) {
    const negate = text.length > 1 && text.startsWith("-");
    const body = negate ? text.slice(1) : text;
    const colon = body.indexOf(":");
    const kind = colon > 0 ? qualifiers[body.slice(0, colon).toLowerCase()] : undefined;
    const value = colon > 0 ? body.slice(colon + 1) : "";
    // A known qualifier with a value; anything else ("fix:", "a:b", "-") is a word, so commit subjects stay searchable.
    if (!kind || (!value && !quoted)) {
      if (body && body !== "-") query.words.push({ value: body, negate });
      continue;
    }
    if (kind === "before" || kind === "after") {
      if (negate) query.errors.push(`-${kind}: isn't supported; use ${kind === "before" ? "after" : "before"}: instead.`);
      else if (!datePattern.test(value) || Number.isNaN(Date.parse(value))) query.errors.push(`${kind}: needs a date like 2026-11-01.`);
      else query[kind] = value;
      continue;
    }
    if (kind === "sha" && !/^[0-9a-f]{1,64}$/i.test(value)) { query.errors.push(`sha: needs hexadecimal digits, not “${value}”.`); continue; }
    if (kind === "content" && negate) { query.errors.push("-content: isn't supported."); continue; }
    query.fields[kind].push({ value, negate });
  }
  if (query.fields.content.length > 1) query.errors.push("Only one content: term per search.");
  return query;
}

const contains = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());
const person = (name: string, email: string, value: string) => contains(name, value) || contains(email, value);
const positives = (terms: QueryTerm[]) => terms.filter(term => !term.negate).map(term => term.value);
const negatives = (terms: QueryTerm[]) => terms.filter(term => term.negate).map(term => term.value);

/** Whether a free word appears anywhere the search looks: message, author, committer, SHA prefix or a ref name. */
function wordMatches(commit: GitSearchCommit, word: string) {
  return contains(commit.message, word) || person(commit.authorName, commit.authorEmail, word) || person(commit.committerName, commit.committerEmail, word)
    || commit.oid.toLowerCase().startsWith(word.toLowerCase()) || commit.refs.some(ref => contains(ref, word));
}

/**
 * The checks git can't make: free words (each in some field), negated words and qualifiers, and SHA prefixes. Git
 * already applied author, committer, message, path, ref, content and date filters, which this checks again where cheap.
 */
export function matchesHistoryQuery(query: HistoryQuery, commit: GitSearchCommit): boolean {
  const { fields } = query;
  if (!query.words.every(term => wordMatches(commit, term.value) !== term.negate)) return false;
  const anyOf = (values: string[], test: (value: string) => boolean) => !values.length || values.some(test);
  const noneOf = (values: string[], test: (value: string) => boolean) => !values.some(test);
  const author = (value: string) => person(commit.authorName, commit.authorEmail, value);
  const committer = (value: string) => person(commit.committerName, commit.committerEmail, value);
  const message = (value: string) => contains(commit.message, value);
  const sha = (value: string) => commit.oid.toLowerCase().startsWith(value.toLowerCase());
  return anyOf(positives(fields.author), author) && noneOf(negatives(fields.author), author)
    && anyOf(positives(fields.committer), committer) && noneOf(negatives(fields.committer), committer)
    && positives(fields.message).every(message) && noneOf(negatives(fields.message), message)
    && anyOf(positives(fields.sha), sha) && noneOf(negatives(fields.sha), sha);
}

/** A pathspec matching any path that contains `text`, case-insensitively (without :(glob), `*` also matches `/`). */
const pathspec = (text: string, exclude: boolean) => `:(${exclude ? "exclude," : ""}icase)*${text.replace(/[*?[\\]/g, "\\$&")}*`;

/** A ref name as the window knows it (main, origin/main, v1.0) to the commit it points at. */
function resolveRef(name: string, refs: ReadonlyMap<string, readonly GitRefDecoration[]>) {
  const lower = name.toLowerCase();
  let partial: string | null = null;
  for (const [oid, decorations] of refs) {
    for (const decoration of decorations) {
      if (decoration.name === name) return oid;
      if (!partial && decoration.name.toLowerCase() === lower) partial = oid;
    }
  }
  return partial;
}

/**
 * The git log a query runs: where the walk starts (HEAD, or the branches it names), what git filters, and the
 * commit test for the rest. An error explains a query that can't run (a bad date, an unknown branch).
 */
export function historySearch(query: HistoryQuery, head: string, refs: ReadonlyMap<string, readonly GitRefDecoration[]>): { search: GitHistoryQuery; error: null } | { search: null; error: string } {
  if (query.errors.length) return { search: null, error: query.errors.join(" ") };
  const { fields } = query;
  const revisions: string[] = [];
  for (const term of fields.ref) {
    const oid = resolveRef(term.value, refs);
    if (!oid) return { search: null, error: `No branch or tag named “${term.value}”.` };
    revisions.push(term.negate ? `^${oid}` : oid);
  }
  if (!revisions.some(revision => !revision.startsWith("^"))) revisions.unshift(head);
  const options: string[] = [];
  const author = positives(fields.author), committer = positives(fields.committer), message = positives(fields.message);
  for (const value of author) options.push(`--author=${value}`);
  for (const value of committer) options.push(`--committer=${value}`);
  for (const value of message) options.push(`--grep=${value}`);
  if (message.length > 1) options.push("--all-match");
  // Fixed strings, case-insensitive, like a search field: "fix(" finds "fix(" and does not fail as a regex.
  if (options.length) options.unshift("--regexp-ignore-case", "--fixed-strings");
  const content = positives(fields.content)[0];
  if (content) options.push(`-S${content}`);
  // Midnight explicitly: a bare date makes git use the current time of day.
  if (query.after) options.push(`--since=${query.after} 00:00:00`);
  if (query.before) options.push(`--until=${query.before} 00:00:00`);
  const paths = [...positives(fields.path).map(text => pathspec(text, false)), ...negatives(fields.path).map(text => pathspec(text, true))];
  const needsMatch = query.words.length > 0 || fields.sha.length > 0 || [fields.author, fields.committer, fields.message].some(terms => terms.some(term => term.negate));
  return { search: { revisions, options, paths, match: needsMatch ? commit => matchesHistoryQuery(query, commit) : undefined }, error: null };
}
