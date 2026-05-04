import { markdownFileTypes } from "./appConstants";

export function isMarkdownPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && markdownFileTypes.includes(extension);
}

export function getLaunchMarkdownFile(launchArguments: string[] | undefined) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  return launchArguments?.find(isMarkdownPath) ?? argv.find(isMarkdownPath) ?? null;
}

export function getDirectory(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : undefined;
}

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}
