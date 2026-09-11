import { getFilename } from "@legend-apps/document-app";
import { getSyntaxLanguageForPath } from "@legend-apps/syntax-parser";

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

export { getFilename };
