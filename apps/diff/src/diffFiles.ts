import { openFileDialog } from "@legend-desktop/file-dialog";

const diffFolderLaunchArgument = "--diff-folder";
const diffSourceLaunchArgument = "--diff-source";
const diffUrlLaunchArgument = "--diff-url";
const diffCwdLaunchArgument = "--cwd";
const diffNamespacedCwdLaunchArgument = "--diff-cwd";
const diffUrlScheme = "legend-diff:";

export type DiffOpenSource =
  | {
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
    };

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
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

function createGitDiffSource(value: string, cwd: string | null | undefined): DiffOpenSource | null {
  const trimmedCwd = cwd?.trim();
  return trimmedCwd ? {
    args: [value],
    cwd: trimmedCwd,
    kind: "git",
    label: value,
    value: `${trimmedCwd} ${value}`,
  } : null;
}

function normalizeDiffOpenSourceString(value: string, cwd?: string | null) {
  const trimmedValue = value.trim();
  const fileUrlPath = getFileUrlPath(trimmedValue);
  const folderPath = fileUrlPath ?? (!hasUrlScheme(trimmedValue) && !isGitDiffArgument(trimmedValue)
    ? resolvePath(trimmedValue, cwd)
    : null);
  return getGithubDiffSource(trimmedValue)
    ?? (isGitDiffArgument(trimmedValue) ? createGitDiffSource(trimmedValue, cwd) : null)
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
  let source = normalizeDiffOpenSource(explicitSource, cwd);

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
    allowsMultipleSelection: false,
    canChooseDirectories: true,
    canChooseFiles: false,
  });

  return paths?.[0] ?? null;
}

function getFirstPositionalLaunchArgument(args: string[]) {
  const valueFlags = new Set([
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

export function getDiffSourceFromOpenUrl(value: string) {
  const url = parseUrl(value);
  let source: DiffOpenSource | null = null;
  if (url?.protocol === diffUrlScheme && url.hostname === "open") {
    const cwd = url.searchParams.get("cwd");
    const args = getDiffOpenUrlArgs(url);
    source = getLaunchDiffSource([...args, ...(cwd ? [diffCwdLaunchArgument, cwd] : [])]);
  }
  return source;
}
