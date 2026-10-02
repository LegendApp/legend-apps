import { getLaunchDocumentPath } from "@legendapp/spark/app/documents";
import { markdownFileTypes } from "./appConstants";

export const newMarkdownDocumentLaunchArgument = "--markdown-new-document";

export function isMarkdownPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && markdownFileTypes.includes(extension);
}

export function shouldLaunchNewMarkdownDocument(launchArguments: string[] | undefined) {
  return launchArguments?.includes(newMarkdownDocumentLaunchArgument) ?? false;
}

export function getLaunchMarkdownFile(launchArguments: string[] | undefined) {
  return getLaunchDocumentPath({
    isDocumentPath: isMarkdownPath,
    launchArguments,
  });
}

export function getDirectory(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : undefined;
}

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}
