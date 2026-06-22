import { openFileDialog } from "@legend-desktop/file-dialog";

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

export async function openDiffFolderDialog() {
  const paths = await openFileDialog({
    allowsMultipleSelection: false,
    canChooseDirectories: true,
    canChooseFiles: false,
  });

  return paths?.[0] ?? null;
}
