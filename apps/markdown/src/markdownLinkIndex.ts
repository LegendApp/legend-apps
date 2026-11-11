import { getDirectory, getFilename, isMarkdownPath } from "./markdownFiles";

/** A `[[wikilink]]`, `![[embed]]` or Markdown link to a relative note path, as written in a source file. */
export type MarkdownNoteLink = {
  embed: boolean;
  end: number;
  kind: "markdown" | "wiki";
  start: number;
  /** `Heading` or `^block` after `#`, if any. */
  subpath: string | null;
  /** Path or name of the target note, without the `#subpath`. Markdown link paths are URL-decoded. */
  target: string;
};

/** A span of a source file that mentions a note, with the line around it for display. */
export type NoteMention = {
  context: string;
  /** Offset of `context` in the source text. */
  contextStart: number;
  end: number;
  start: number;
  text: string;
};

export type NoteMentions = { mentions: NoteMention[]; source: string };

type IndexedNote = { links: MarkdownNoteLink[]; text: string };

const fencePattern = /^ {0,3}(`{3,}|~{3,})/;
const wikiLinkPattern = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const markdownLinkPattern = /(!?)\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;

/** Replaces fenced code blocks, inline code spans and frontmatter with spaces, keeping offsets. */
export function maskMarkdownCode(text: string) {
  const blank = (value: string) => value.replace(/[^\n]/g, " ");
  let masked = "";
  let fence: string | null = null;
  let offset = 0;
  if (text.startsWith("---\n")) {
    const close = text.indexOf("\n---", 3);
    if (close >= 0) {
      const end = text.indexOf("\n", close + 4);
      offset = end < 0 ? text.length : end;
      masked = blank(text.slice(0, offset));
    }
  }
  for (const line of text.slice(offset).split(/(?<=\n)/)) {
    const marker = fencePattern.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length)) fence = null;
      masked += blank(line);
    } else if (marker) {
      fence = marker;
      masked += blank(line);
    } else masked += line;
  }
  // Inline code: a backtick run closes at the next run of the same length.
  return masked.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, blank);
}

function splitSubpath(value: string) {
  const hash = value.indexOf("#");
  return hash < 0 ? { subpath: null, target: value } : { subpath: value.slice(hash + 1) || null, target: value.slice(0, hash) };
}

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Finds note links outside code. Links to the note itself (`[[#Heading]]`) and external URLs are skipped. */
export function parseNoteLinks(text: string): MarkdownNoteLink[] {
  const masked = maskMarkdownCode(text);
  const links: MarkdownNoteLink[] = [];
  for (const match of masked.matchAll(wikiLinkPattern)) {
    const inner = match[2];
    const { subpath, target } = splitSubpath(inner.split("|")[0]);
    if (!target.trim()) continue;
    links.push({ embed: match[1] === "!", end: match.index + match[0].length, kind: "wiki", start: match.index, subpath, target: target.trim() });
  }
  for (const match of masked.matchAll(markdownLinkPattern)) {
    const url = match[2].replace(/^<|>$/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
    const { subpath, target } = splitSubpath(url);
    const path = decode(target);
    if (!path || !isMarkdownPath(path)) continue;
    links.push({ embed: match[1] === "!", end: match.index + match[0].length, kind: "markdown", start: match.index, subpath: subpath && decode(subpath), target: path });
  }
  return links.sort((a, b) => a.start - b.start);
}

function stripMarkdownExtension(path: string) {
  return isMarkdownPath(path) ? path.slice(0, path.lastIndexOf(".")) : path;
}

/** The note title Obsidian shows: the filename without its Markdown extension. */
export function getNoteTitle(path: string) {
  return stripMarkdownExtension(getFilename(path));
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function getLineContext(text: string, start: number, end: number) {
  const contextStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  return { context: text.slice(contextStart, lineEnd < 0 ? text.length : lineEnd), contextStart };
}

/** Links and text of every Markdown note in a vault folder, updated one file at a time. */
export class VaultLinkIndex {
  private readonly notes = new Map<string, IndexedNote>();
  /** Lowercased title → paths, for resolving `[[Title]]`. */
  private readonly byTitle = new Map<string, Set<string>>();

  constructor(readonly root: string) {}

  get size() {
    return this.notes.size;
  }

  paths() {
    return this.notes.keys();
  }

  getText(path: string) {
    return this.notes.get(path)?.text;
  }

  set(path: string, text: string) {
    if (!this.notes.has(path)) {
      const title = getNoteTitle(path).toLowerCase();
      const paths = this.byTitle.get(title) ?? new Set();
      paths.add(path);
      this.byTitle.set(title, paths);
    }
    this.notes.set(path, { links: parseNoteLinks(text), text });
  }

  delete(path: string) {
    if (!this.notes.delete(path)) return;
    const title = getNoteTitle(path).toLowerCase();
    this.byTitle.get(title)?.delete(path);
    if (this.byTitle.get(title)?.size === 0) this.byTitle.delete(title);
  }

  private relative(path: string) {
    return path.startsWith(`${this.root}/`) ? path.slice(this.root.length + 1) : path;
  }

  /**
   * Resolves like Obsidian: the extension is optional and names match case-insensitively. An exact vault-relative
   * path wins, then a path relative to the linking note, then the shortest path ending in the link.
   */
  resolve(link: Pick<MarkdownNoteLink, "kind" | "target">, from: string): string | null {
    const fromDirectory = getDirectory(from) ?? this.root;
    if (link.kind === "markdown") {
      const wanted = normalizePath(link.target.startsWith("/") ? `${this.root}${link.target}` : `${fromDirectory}/${link.target}`).toLowerCase();
      for (const candidate of this.byTitle.get(getNoteTitle(wanted)) ?? []) {
        if (candidate.toLowerCase() === wanted) return candidate;
      }
      return null;
    }
    const target = stripMarkdownExtension(link.target.replace(/^\/+/, "")).toLowerCase();
    const candidates = [...this.byTitle.get(getNoteTitle(target)) ?? []];
    const withoutExtension = (path: string) => stripMarkdownExtension(path).toLowerCase();
    const exact = candidates.find(path => withoutExtension(this.relative(path)) === target)
      ?? candidates.find(path => withoutExtension(path) === normalizePath(`${fromDirectory}/${target}`).toLowerCase());
    if (exact) return exact;
    return candidates
      .filter(path => `/${withoutExtension(this.relative(path))}`.endsWith(`/${target}`))
      .sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? null;
  }

  /** Links to `target` from other notes, grouped by source note. */
  linkedMentions(target: string): NoteMentions[] {
    const groups: NoteMentions[] = [];
    for (const [source, { links, text }] of this.notes) {
      const mentions = links
        .filter(link => this.resolve(link, source) === target)
        .map(({ end, start }) => ({ ...getLineContext(text, start, end), end, start, text: text.slice(start, end) }));
      if (mentions.length > 0) groups.push({ mentions, source });
    }
    return groups.sort((a, b) => a.source.localeCompare(b.source));
  }
}

