import { openFileDialog } from "@legendapp/spark/dialogs";

const diffFolderLaunchArgument = "--diff-folder";
const diffSourceLaunchArgument = "--diff-source";
const diffUrlLaunchArgument = "--diff-url";
const diffCwdLaunchArgument = "--cwd";
const diffNamespacedCwdLaunchArgument = "--diff-cwd";
const diffUrlScheme = "legend-diff:";

export type DiffGitComparison =
  | { kind: "index-vs-workdir" }
  | { kind: "head-vs-index" }
  | { kind: "commit"; sha: string }
  | { kind: "range"; range: string };

export type DiffGitOpenSource = DiffGitComparison & {
  cwd: string;
  label: string;
  value: string;
};

export type DiffOpenSource =
  | DiffGitOpenSource
  | {
      compareBase?: DiffFolderCompareBase;
      kind: "folder";
      label: string;
      value: string;
    }
  | {
      diffUrl: string;
      kind: "github";
      label: string;
      value: string;
    }
  | {
      args: string[];
      cwd: string;
      kind: "git";
      label: string;
      value: string;
    }
  | {
      kind: "filePair";
      label: string;
      newPath: string;
      oldPath: string;
      value: string;
    }
  | {
      kind: "diffFile";
      label: string;
      value: string;
    };

export type DiffFilePairOpenSource = Extract<DiffOpenSource, { kind: "filePair" }>;
export type DiffFileOpenSource = Extract<DiffOpenSource, { kind: "diffFile" }>;
export type DiffFolderCompareBase =
  | {
      kind: "head";
    }
  | {
      kind: "ref";
      ref: string;
      useMergeBase?: boolean;
    };

export function createDiffGitSource(cwd: string, comparison: DiffGitComparison): DiffGitOpenSource {
  const target = comparison.kind === "commit" ? comparison.sha
    : comparison.kind === "range" ? comparison.range : comparison.kind;
  const label = comparison.kind === "index-vs-workdir" ? "Worktree vs Index"
    : comparison.kind === "head-vs-index" ? "Index vs HEAD"
    : comparison.kind === "commit" ? `Commit ${comparison.sha.slice(0, 12)}` : comparison.range;
  return { ...comparison, cwd, label, value: `${cwd} ${target}` };
}

export function isDiffGitSource(source: DiffOpenSource): source is DiffGitOpenSource | Extract<DiffOpenSource, { kind: "git" }> {
  return source.kind === "git" || source.kind === "index-vs-workdir" || source.kind === "head-vs-index"
    || source.kind === "commit" || source.kind === "range";
}

function isGitRange(value: string) {
  return !value.startsWith("-") && /^[^\s.]+(?:\.[^\s.]+)*\.{2,3}[^\s.]+(?:\.[^\s.]+)*$/.test(value);
}

function getExplicitGitSource(args: string[], cwd: string | null | undefined) {
  if (!cwd?.trim()) return null;
  if (args.length === 1 && (args[0] === "--index-vs-workdir" || args[0] === "--head-vs-index")) {
    return createDiffGitSource(cwd, { kind: args[0].slice(2) as "index-vs-workdir" | "head-vs-index" });
  }
  if (args.length === 2 && args[0] === "--commit" && args[1]) {
    return createDiffGitSource(cwd, { kind: "commit", sha: args[1] });
  }
  const range = args.length === 1 ? args[0] : args.length === 2 && args[0] === "--range" ? args[1] : null;
  return range && isGitRange(range) ? createDiffGitSource(cwd, { kind: "range", range }) : null;
}

export function getDiffFolderCompareBaseKey(compareBase: DiffFolderCompareBase | undefined) {
  if (!compareBase || compareBase.kind === "head") {
    return "head";
  }
  return `${compareBase.kind}:${compareBase.ref}:${compareBase.useMergeBase === false ? "direct" : "merge-base"}`;
}

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

function getParentDirectory(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : null;
}

export function createDiffFilePairSource(oldPath: string, newPath: string): DiffFilePairOpenSource {
  const oldFilename = getFilename(oldPath);
  const newFilename = getFilename(newPath);
  return {
    kind: "filePair",
    label: oldFilename === newFilename ? oldFilename : `${oldFilename} vs ${newFilename}`,
    newPath,
    oldPath,
    value: `${oldPath}\n${newPath}`,
  };
}

export function getDiffRepresentedUrl(source: DiffOpenSource | null | undefined) {
  return source?.kind === "diffFile" ? `file://${source.value.split("/").map(encodeURIComponent).join("/")}` : null;
}

export function isDiffFilePath(path: string) {
  return /\.(diff|patch)$/i.test(path);
}

export function createDiffFileSource(path: string): DiffFileOpenSource {
  return {
    kind: "diffFile",
    label: getFilename(path),
    value: path,
  };
}

function getLaunchArgumentValue(args: string[], name: string) {
  const prefix = `${name}=`;
  const arg = args.find((argument) => argument.startsWith(prefix));
  if (arg) {
    return arg.slice(prefix.length) || null;
  }

  const flagIndex = args.indexOf(name);
  const value = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

function parseUrl(value: string) {
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }

  if (!url && /^(github\.com|www\.github\.com|diffshub\.com|www\.diffshub\.com)\//i.test(value)) {
    try {
      url = new URL(`https://${value}`);
    } catch {
      url = null;
    }
  }

  return url;
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return `${path.startsWith("/") ? "/" : ""}${parts.join("/")}`;
}

function resolvePath(value: string, cwd: string | null | undefined) {
  if (value.startsWith("/")) {
    return normalizePath(value);
  }
  if (cwd) {
    return normalizePath(`${cwd.replace(/\/+$/, "")}/${value}`);
  }
  return value;
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function getFileUrlPath(value: string) {
  const url = parseUrl(value);
  let path: string | null = null;
  if (url?.protocol === "file:" && url.pathname) {
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = url.pathname;
    }
  }
  return path;
}

function stripPathInputQuotes(value: string) {
  const trimmedValue = value.trim();
  if (
    (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }
  return trimmedValue;
}

function getLocalInputPath(value: string, cwd: string | null | undefined) {
  const trimmedValue = stripPathInputQuotes(value);
  const fileUrlPath = getFileUrlPath(trimmedValue);
  return fileUrlPath ?? (!hasUrlScheme(trimmedValue) ? resolvePath(trimmedValue, cwd) : null);
}

function getFilePairSourceFromText(value: string, cwd: string | null | undefined) {
  const lines = value
    .split(/\r?\n/)
    .map(stripPathInputQuotes)
    .filter(Boolean);
  let source: DiffFilePairOpenSource | null = null;
  if (lines.length === 2) {
    const oldPath = getLocalInputPath(lines[0], cwd);
    const newPath = getLocalInputPath(lines[1], cwd);
    source = oldPath && newPath ? createDiffFilePairSource(oldPath, newPath) : null;
  }
  return source;
}

function getGithubDiffSource(value: string): DiffOpenSource | null {
  const url = parseUrl(value);

  let source: DiffOpenSource | null = null;
  if (url && (url.hostname === "github.com" || url.hostname === "www.github.com" || url.hostname === "diffshub.com" || url.hostname === "www.diffshub.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];
    const type = parts[2];
    const identifier = parts[3]?.replace(/\.(diff|patch)$/, "");
    if (owner && repo && identifier && (type === "pull" || type === "commit")) {
      const canonicalUrl = `https://github.com/${owner}/${repo}/${type}/${identifier}`;
      source = {
        diffUrl: `${canonicalUrl}.diff`,
        kind: "github",
        label: type === "pull" ? `${owner}/${repo}#${identifier}` : `${owner}/${repo}@${identifier.slice(0, 7)}`,
        value: canonicalUrl,
      };
    }
  }

  return source;
}

function isGitDiffArgument(value: string) {
  return value.includes("..") && !value.startsWith(".");
}

function createGitDiffSource(args: string[], cwd: string | null | undefined): DiffOpenSource | null {
  const trimmedCwd = cwd?.trim();
  const label = args.join(" ");
  return trimmedCwd ? {
    args,
    cwd: trimmedCwd,
    kind: "git",
    label,
    value: `${trimmedCwd} ${label}`,
  } : null;
}

function normalizeDiffOpenSourceString(value: string, cwd?: string | null) {
  const trimmedValue = value.trim();
  const resolvedFilePath = getLocalInputPath(trimmedValue, cwd);
  const folderPath = !isGitDiffArgument(trimmedValue)
    ? resolvedFilePath
    : null;
  return getDiffSourceFromOpenUrl(trimmedValue)
    ?? getFilePairSourceFromText(trimmedValue, cwd)
    ?? getGithubDiffSource(trimmedValue)
    ?? getExplicitGitSource([trimmedValue], cwd)
    ?? (isGitDiffArgument(trimmedValue) ? createGitDiffSource([trimmedValue], cwd) : null)
    ?? (resolvedFilePath && isDiffFilePath(resolvedFilePath) ? createDiffFileSource(resolvedFilePath) : null)
    ?? (folderPath ? {
      kind: "folder" as const,
      label: getFilename(folderPath),
      value: folderPath,
    } : null);
}

export function normalizeDiffOpenSource(value: DiffOpenSource | string | null | undefined, cwd?: string | null): DiffOpenSource | null {
  let source: DiffOpenSource | null = null;
  if (typeof value === "string") {
    source = normalizeDiffOpenSourceString(value, cwd);
  } else if (value) {
    source = value;
  }
  return source;
}

export function getDiffRecentDocumentPath(source: DiffOpenSource) {
  return source.kind === "folder" ? source.value : null;
}

export function getDiffSourceLabel(source: DiffOpenSource | null | undefined) {
  return source?.label ?? "Legend Diff";
}

export function getLaunchDiffSource(launchArguments: string[] | undefined) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  const args = launchArguments ?? argv;
  const cwd = getLaunchArgumentValue(args, diffCwdLaunchArgument)
    ?? getLaunchArgumentValue(args, diffNamespacedCwdLaunchArgument)
    ?? null;
  const explicitSource = getLaunchArgumentValue(args, diffSourceLaunchArgument)
    ?? getLaunchArgumentValue(args, diffUrlLaunchArgument)
    ?? getLaunchArgumentValue(args, diffFolderLaunchArgument);
  const commit = getLaunchArgumentValue(args, "--commit");
  const range = getLaunchArgumentValue(args, "--range");
  const comparisonArgs = commit ? ["--commit", commit] : range ? ["--range", range]
    : args.includes("--head-vs-index") ? ["--head-vs-index"]
    : args.includes("--index-vs-workdir") ? ["--index-vs-workdir"] : [];
  let source = normalizeDiffOpenSource(explicitSource, cwd) ?? getExplicitGitSource(comparisonArgs, cwd);

  if (!source) {
    const githubUrl = args.find((argument) => getGithubDiffSource(argument));
    source = normalizeDiffOpenSource(githubUrl);
  }
  if (!source) {
    const positionalArg = getFirstPositionalLaunchArgument(args);
    source = positionalArg ? normalizeDiffOpenSource(positionalArg, cwd) : normalizeDiffOpenSource(cwd);
  }

  return source;
}

export function getLaunchDiffFolder(launchArguments: string[] | undefined) {
  const source = getLaunchDiffSource(launchArguments);
  return source?.kind === "folder" ? source.value : null;
}

export async function openDiffFolderDialog() {
  const paths = await openFileDialog({
    multiple: false,
    selection: "directories",
  });

  return (paths.canceled ? null : paths.paths[0] ?? null);
}

export async function openDiffFilePairDialog() {
  const oldPaths = await openFileDialog({
    multiple: false,
    selection: "files",
    message: "Select the earlier version to show on the left side of the comparison.",
    prompt: "Choose Original",
    title: "Choose Original File",
  });
  const oldPath = (oldPaths.canceled ? null : oldPaths.paths[0] ?? null);
  let source: DiffOpenSource | null = null;
  if (oldPath) {
    const newPaths = await openFileDialog({
      multiple: false,
      selection: "files",
      defaultPath: getParentDirectory(oldPath) ?? undefined,
      message: "Select the modified version to show on the right side of the comparison.",
      prompt: "Choose Modified",
      title: "Choose Modified File",
    });
    const newPath = (newPaths.canceled ? null : newPaths.paths[0] ?? null);
    source = newPath ? createDiffFilePairSource(oldPath, newPath) : null;
  }
  return source;
}

function getFirstPositionalLaunchArgument(args: string[]) {
  const valueFlags = new Set([
    "--commit",
    "--range",
    diffCwdLaunchArgument,
    diffFolderLaunchArgument,
    diffNamespacedCwdLaunchArgument,
    diffSourceLaunchArgument,
    diffUrlLaunchArgument,
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      index += 1;
    } else if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return null;
}

function getDiffOpenUrlArgs(url: URL) {
  const argsJson = url.searchParams.get("args");
  let args = url.searchParams.getAll("arg");
  if (argsJson) {
    try {
      const parsed = JSON.parse(argsJson) as unknown;
      if (Array.isArray(parsed) && parsed.every((arg) => typeof arg === "string")) {
        args = parsed;
      }
    } catch {
      args = [];
    }
  }
  return args;
}

function isExplicitLocalCliSource(value: string) {
  return value === "."
    || value.startsWith("./")
    || value.startsWith("../")
    || value.startsWith("/")
    || value.startsWith("file://");
}

function getDiffCliSource(args: string[], cwd: string | null) {
  let source: DiffOpenSource | null = null;
  if (args.length === 0) {
    source = normalizeDiffOpenSource(cwd);
  } else if (args.length === 1) {
    const argument = args[0];
    const resolvedPath = getLocalInputPath(argument, cwd);
    source = getGithubDiffSource(argument)
      ?? (resolvedPath && isDiffFilePath(resolvedPath) ? createDiffFileSource(resolvedPath) : null)
      ?? (isExplicitLocalCliSource(argument) ? normalizeDiffOpenSource(argument, cwd) : null);
  }
  return source ?? getExplicitGitSource(args, cwd) ?? createGitDiffSource(args, cwd);
}

export function getDiffSourceFromOpenUrl(value: string) {
  const url = parseUrl(value);
  let source: DiffOpenSource | null = null;
  if (url?.protocol === diffUrlScheme && url.hostname === "open") {
    const cwd = url.searchParams.get("cwd");
    const args = getDiffOpenUrlArgs(url);
    source = getDiffCliSource(args, cwd);
  }
  return source;
}
