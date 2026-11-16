export type IgnoreRule = { directoryOnly: boolean; negate: boolean; regex: RegExp };

/** Rules from one .gitignore, matched against paths relative to its directory. */
export type IgnoreScope = { base: string; rules: IgnoreRule[] };

/** Hidden in every folder, with or without a .gitignore. */
export const alwaysIgnoredNames: ReadonlySet<string> = new Set([".git", ".DS_Store", "node_modules"]);

function globToRegex(glob: string) {
  let source = "";
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      const atStart = index === 0, slashAfter = glob[index + 2] === "/";
      if ((atStart || glob[index - 1] === "/") && slashAfter) { source += "(?:.*/)?"; index += 2; continue; }
      if (glob[index - 1] === "/" && index + 2 === glob.length) { source += ".*"; index += 1; continue; }
      source += "[^/]*"; index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "\\" && index + 1 < glob.length) source += glob[++index].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    else if (char === "[") {
      const end = glob.indexOf("]", index + 2);
      if (end < 0) { source += "\\["; continue; }
      const body = glob.slice(index + 1, end).replace(/\\/g, "\\\\");
      source += `[${body.startsWith("!") ? `^${body.slice(1)}` : body}]`;
      index = end;
    } else source += char.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return source;
}

export function parseGitignore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    let pattern = line.replace(/(?<!\\)\s+$/, "");
    if (!pattern || pattern.startsWith("#")) continue;
    const negate = pattern.startsWith("!");
    if (negate) pattern = pattern.slice(1);
    else if (pattern.startsWith("\\!") || pattern.startsWith("\\#")) pattern = pattern.slice(1);
    const directoryOnly = pattern.endsWith("/");
    if (directoryOnly) pattern = pattern.slice(0, -1);
    if (!pattern) continue;
    // A slash anywhere but the end anchors the pattern to the .gitignore directory.
    const anchored = pattern.includes("/");
    if (pattern.startsWith("/")) pattern = pattern.slice(1);
    rules.push({ directoryOnly, negate, regex: new RegExp(`^${anchored ? "" : "(?:.*/)?"}${globToRegex(pattern)}$`) });
  }
  return rules;
}

/** Later rules and deeper scopes win, as in git. Callers stop descending into ignored directories. */
export function isIgnored(scopes: readonly IgnoreScope[], path: string, isDirectory: boolean) {
  if (alwaysIgnoredNames.has(path.slice(path.lastIndexOf("/") + 1))) return true;
  let ignored = false;
  for (const { base, rules } of scopes) {
    if (!path.startsWith(`${base}/`)) continue;
    const relative = path.slice(base.length + 1);
    for (const rule of rules) {
      if ((!rule.directoryOnly || isDirectory) && rule.regex.test(relative)) ignored = !rule.negate;
    }
  }
  return ignored;
}
