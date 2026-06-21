import { codeFileTypes } from "./appConstants";

export function isCodePath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && codeFileTypes.includes(extension);
}

export function getLaunchCodeFile(launchArguments: string[] | undefined) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  return launchArguments?.find(isCodePath) ?? argv.find(isCodePath) ?? null;
}

export function getCodeLanguage(path: string) {
  return path.toLowerCase().endsWith(".tsx") ? "tsx" : "typescript";
}

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}
