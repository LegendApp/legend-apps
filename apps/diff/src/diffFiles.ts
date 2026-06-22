import { openFileDialog } from "@legend-desktop/file-dialog";

const diffFolderLaunchArgument = "--diff-folder";

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

export function getLaunchDiffFolder(launchArguments: string[] | undefined) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  const args = launchArguments ?? argv;
  const folderPrefix = `${diffFolderLaunchArgument}=`;
  const folderArg = args.find((argument) => argument.startsWith(folderPrefix));
  if (folderArg) {
    return folderArg.slice(folderPrefix.length) || null;
  }

  const folderFlagIndex = args.indexOf(diffFolderLaunchArgument);
  const folderPath = folderFlagIndex >= 0 ? args[folderFlagIndex + 1] : undefined;
  return folderPath && !folderPath.startsWith("--") ? folderPath : null;
}

export async function openDiffFolderDialog() {
  const paths = await openFileDialog({
    allowsMultipleSelection: false,
    canChooseDirectories: true,
    canChooseFiles: false,
  });

  return paths?.[0] ?? null;
}
