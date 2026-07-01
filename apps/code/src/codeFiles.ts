import { getFilename, getLaunchDocumentPath, pathMatchesExtensions } from "@legend-desktop/document-app";
import { codeFileTypes } from "./appConstants";

export function isCodePath(path: string) {
  return pathMatchesExtensions(path, codeFileTypes);
}

export function getLaunchCodeFile(launchArguments: string[] | undefined) {
  return getLaunchDocumentPath({
    isDocumentPath: isCodePath,
    launchArguments,
  });
}

export function getCodeLanguage(path: string) {
  return path.toLowerCase().endsWith(".tsx") ? "tsx" : "typescript";
}

export { getFilename };
