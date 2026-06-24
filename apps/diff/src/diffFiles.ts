import { openFileDialog } from "@legend-desktop/file-dialog";

const diffFolderLaunchArgument = "--diff-folder";
const diffSourceLaunchArgument = "--diff-source";
const diffUrlLaunchArgument = "--diff-url";

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

function getGithubDiffSource(value: string): DiffOpenSource | null {
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }

  let source: DiffOpenSource | null = null;
  if (url && (url.hostname === "github.com" || url.hostname === "www.github.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];
    const type = parts[2];
    const identifier = parts[3]?.replace(/\.diff$/, "");
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

export function normalizeDiffOpenSource(value: DiffOpenSource | string | null | undefined): DiffOpenSource | null {
  let source: DiffOpenSource | null = null;
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    source = getGithubDiffSource(trimmedValue) ?? (trimmedValue ? {
      kind: "folder",
      label: getFilename(trimmedValue),
      value: trimmedValue,
    } : null);
  } else if (value) {
    source = value;
  }
  return source;
}

export function getDiffSourceLabel(source: DiffOpenSource | null | undefined) {
  return source?.label ?? "Legend Diff";
}

export function getLaunchDiffSource(launchArguments: string[] | undefined) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  const args = launchArguments ?? argv;
  const explicitSource = getLaunchArgumentValue(args, diffSourceLaunchArgument)
    ?? getLaunchArgumentValue(args, diffUrlLaunchArgument)
    ?? getLaunchArgumentValue(args, diffFolderLaunchArgument);
  let source = normalizeDiffOpenSource(explicitSource);

  if (!source) {
    const githubUrl = args.find((argument) => getGithubDiffSource(argument));
    source = normalizeDiffOpenSource(githubUrl);
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
