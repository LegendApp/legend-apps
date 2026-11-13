import { getSyntaxLanguageForPath } from "@legend-apps/syntax-parser";
import { openFileDialog } from "@legendapp/spark/dialogs";

export async function openCodeFileDialog() {
  const result = await openFileDialog({ selection: "files" });
  return result.canceled ? null : result.paths.find(isCodePath) ?? null;
}

export function isCodePath(path: string) {
  return path.length > 0 && !path.startsWith("-") && !path.endsWith("/");
}

export function getLaunchCodeFile(launchArguments: string[] | undefined) {
  // Do not mistake the runtime executable for a document now that every
  // extension (including no extension) is accepted.
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv.slice(2) : [];
  const args = launchArguments ?? argv;
  // The macOS host passes NSProcessInfo.arguments, including its Mach-O binary.
  // Secondary document windows instead pass only their explicit document path.
  const documents = args[0]?.match(/\.app\/Contents\/MacOS\/[^/]+$/) ? args.slice(1) : args;
  return documents.find(isCodePath) ?? null;
}

export function getCodeLanguage(path: string) {
  return getSyntaxLanguageForPath(path);
}

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

export function getCodeRepresentedUri(path: string | null) {
  return path ? `file://${path.split("/").map(encodeURIComponent).join("/")}` : null;
}
