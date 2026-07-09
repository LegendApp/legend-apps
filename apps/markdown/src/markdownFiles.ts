import { getDirectory, getFilename, getLaunchDocumentPath, pathMatchesExtensions } from "@legend-apps/document-app";
import { markdownFileTypes } from "./appConstants";

export const newMarkdownDocumentLaunchArgument = "--markdown-new-document";

export function isMarkdownPath(path: string) {
  return pathMatchesExtensions(path, markdownFileTypes);
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

export { getDirectory, getFilename };
