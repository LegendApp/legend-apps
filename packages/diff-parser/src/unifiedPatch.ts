export type UnifiedPatchLine = {
  kind: " " | "-" | "+";
  text: string;
  noNewline: boolean;
  oldLine: number;
  newLine: number;
};

export type UnifiedPatchHunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section: string;
  lines: UnifiedPatchLine[];
};

export type UnifiedPatchFile = {
  header: string[];
  oldPath: string | null;
  newPath: string | null;
  binary: boolean;
  hunks: UnifiedPatchHunk[];
};

export class UnifiedPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnifiedPatchError";
  }
}

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function unquote(value: string) {
  if (!value.startsWith("\"")) return value;
  const escapes: Record<string, string> = { a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\"": "\"", "\\": "\\" };
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index]!;
    if (char !== "\\") { bytes.push(...encoder.encode(char)); continue; }
    const next = value[++index]!;
    if (/[0-7]/.test(next)) { bytes.push(parseInt(value.slice(index, index + 3), 8)); index += 2; }
    else bytes.push(...encoder.encode(escapes[next] ?? next));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function headerPath(line: string, prefix: string) {
  const value = unquote(line.slice(4).replace(/\t$/, ""));
  return value === "/dev/null" ? null : value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/** The shared path of a `diff --git a/P b/P` line; renames are resolved later from their own headers. */
function gitLinePath(names: string) {
  if (names.startsWith("\"")) {
    const end = names.search(/(?<!\\)" /);
    return end < 0 ? null : unquote(names.slice(0, end + 1)).replace(/^a\//, "");
  }
  const half = (names.length - 1) / 2;
  return Number.isInteger(half) && names[half] === " " ? names.slice(2, half) : null;
}

/** Parses Git's unified patch text, keeping each line's exact bytes (including CR) and no-newline markers. */
export function parseUnifiedPatch(text: string): UnifiedPatchFile[] {
  const files: UnifiedPatchFile[] = [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let file: UnifiedPatchFile | undefined;
  let hunk: UnifiedPatchHunk | undefined;
  let oldLeft = 0, newLeft = 0, oldLine = 0, newLine = 0;
  for (const line of lines) {
    if (hunk && line.startsWith("\\")) {
      const last = hunk.lines.at(-1);
      if (last) last.noNewline = true;
      continue;
    }
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const kind = line[0] ?? " ";
      if (kind !== " " && kind !== "-" && kind !== "+") throw new UnifiedPatchError("The patch has a malformed hunk.");
      hunk.lines.push({ kind, text: line.slice(1), noNewline: false, oldLine: kind === "+" ? -1 : oldLine, newLine: kind === "-" ? -1 : newLine });
      if (kind !== "+") { oldLeft -= 1; oldLine += 1; }
      if (kind !== "-") { newLeft -= 1; newLine += 1; }
      continue;
    }
    if (line.startsWith("diff --git ")) {
      const path = gitLinePath(line.slice(11));
      file = { header: [line], oldPath: path, newPath: path, binary: false, hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) continue;
    const match = hunkHeader.exec(line);
    if (match) {
      hunk = { oldStart: Number(match[1]), oldCount: Number(match[2] ?? 1), newStart: Number(match[3]), newCount: Number(match[4] ?? 1), section: match[5]!, lines: [] };
      oldLeft = hunk.oldCount; newLeft = hunk.newCount; oldLine = hunk.oldStart; newLine = hunk.newStart;
      file.hunks.push(hunk);
      continue;
    }
    if (hunk) throw new UnifiedPatchError("The patch has unexpected text after a hunk.");
    file.header.push(line);
    if (line.startsWith("--- ")) file.oldPath = headerPath(line, "a/");
    else if (line.startsWith("+++ ")) file.newPath = headerPath(line, "b/");
    else if (line.startsWith("rename from ")) file.oldPath = unquote(line.slice(12));
    else if (line.startsWith("rename to ")) file.newPath = unquote(line.slice(10));
    else if (line.startsWith("Binary files ") || line === "GIT binary patch") file.binary = true;
  }
  if (oldLeft > 0 || newLeft > 0) throw new UnifiedPatchError("The patch ended inside a hunk.");
  return files;
}

/** Stable identity of a changed line: removals by old line number, additions by new line number. */
export function unifiedPatchLineKey(line: Pick<UnifiedPatchLine, "kind" | "oldLine" | "newLine">) {
  return line.kind === "-" ? `-${line.oldLine}` : line.kind === "+" ? `+${line.newLine}` : null;
}

export function unifiedPatchHunkKeys(hunk: UnifiedPatchHunk) {
  return hunk.lines.flatMap(line => unifiedPatchLineKey(line) ?? []);
}

function renameToModification(header: string[]) {
  const plus = header.find(line => line.startsWith("+++ "));
  const minus = header.find(line => line.startsWith("--- "));
  const raw = plus && plus !== "+++ /dev/null" ? plus.slice(4) : minus!.slice(4).replace(/^("?)a\//, "$1b/");
  const tab = raw.endsWith("\t") ? "\t" : "";
  const target = raw.slice(0, raw.length - tab.length), source = target.replace(/^("?)b\//, "$1a/");
  return [`diff --git ${source} ${target}`, `--- ${source}${tab}`, `+++ ${target}${tab}`];
}

/**
 * Builds a patch that applies only the selected changed lines.
 * Forward patches apply to the diff's old side (`git apply --cached`); reverse patches undo
 * the selected lines from its new side (`git apply --cached --reverse`). Unselected removals
 * stay as context (forward) or are dropped (reverse); unselected additions are dropped
 * (forward) or kept as context (reverse). Mode changes and rename/copy metadata are left out,
 * so a partial patch only changes content of the file's new path.
 */
export function buildUnifiedPatchSelection(file: UnifiedPatchFile, selected: ReadonlySet<string>, options: { reverse?: boolean } = {}) {
  const reverse = options.reverse ?? false;
  if (file.binary) throw new UnifiedPatchError("Binary files can only be staged or unstaged as a whole file.");
  const hunks: string[] = [];
  let delta = 0, oldTotal = 0, newTotal = 0, changes = 0;
  for (const hunk of file.hunks) {
    const out: UnifiedPatchLine[] = [];
    for (const line of hunk.lines) {
      const key = unifiedPatchLineKey(line);
      if (key === null || selected.has(key)) out.push(line);
      else if ((line.kind === "-") !== reverse) out.push({ ...line, kind: " " });
    }
    // A context line without a trailing newline must end both images; split it when a kept change follows.
    for (let index = out.length - 1; index >= 0; index -= 1) {
      const line = out[index]!;
      if (line.kind !== " " || !line.noNewline) continue;
      const after = out.slice(index + 1);
      const oldContinues = after.some(next => next.kind !== "+"), newContinues = after.some(next => next.kind !== "-");
      if (oldContinues || newContinues) out.splice(index, 1, { ...line, kind: "-", noNewline: !oldContinues }, { ...line, kind: "+", noNewline: !newContinues });
    }
    // A kept change line can only lack its newline when nothing follows it on its own side.
    out.forEach((line, index) => {
      if (line.noNewline && line.kind !== " " && out.slice(index + 1).some(next => next.kind !== (line.kind === "-" ? "+" : "-"))) out[index] = { ...line, noNewline: false };
    });
    const kept = out.filter(line => line.kind !== " ").length;
    const oldCount = out.filter(line => line.kind !== "+").length, newCount = out.filter(line => line.kind !== "-").length;
    oldTotal += oldCount; newTotal += newCount;
    if (!kept) { delta += reverse ? hunk.newCount - oldCount : newCount - hunk.oldCount; continue; }
    changes += kept;
    let oldStart: number, newStart: number;
    if (reverse) {
      newStart = hunk.newStart;
      const position = (hunk.newCount === 0 ? hunk.newStart + 1 : hunk.newStart) - delta;
      oldStart = oldCount === 0 ? position - 1 : position;
      delta += hunk.newCount - oldCount;
    } else {
      oldStart = hunk.oldStart;
      const position = (hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart) + delta;
      newStart = newCount === 0 ? position - 1 : position;
      delta += newCount - hunk.oldCount;
    }
    hunks.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${hunk.section}`);
    for (const line of out) {
      hunks.push(`${line.kind}${line.text}`);
      if (line.noNewline) hunks.push("\\ No newline at end of file");
    }
  }
  if (!changes) throw new UnifiedPatchError("Select at least one changed line.");
  const isNew = file.header.some(line => line.startsWith("new file mode ")) || file.header.includes("--- /dev/null");
  const isDeleted = file.header.some(line => line.startsWith("deleted file mode ")) || file.header.includes("+++ /dev/null");
  const keepsCreation = isNew && oldTotal === 0;
  const keepsDeletion = isDeleted && newTotal === 0;
  let header: string[];
  if (keepsCreation || keepsDeletion) {
    header = file.header.filter(line => line.startsWith("diff --git ") || line.startsWith("new file mode ") || line.startsWith("deleted file mode ") || line.startsWith("--- ") || line.startsWith("+++ "));
  } else {
    header = renameToModification(file.header);
  }
  return `${[...header, ...hunks].join("\n")}\n`;
}

/** Picks the file section for a repository path from a parsed patch (destination path first). */
export function findUnifiedPatchFile(files: readonly UnifiedPatchFile[], path: string) {
  return files.find(file => file.newPath === path) ?? files.find(file => file.newPath === null && file.oldPath === path) ?? null;
}
