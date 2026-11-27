import { pathExists } from "@legend-apps/storage";
import { getFilename } from "./markdownFiles";
import { markdownStorage } from "./markdownStorage";

const draftsFolder = "Drafts";
const draftName = /^Untitled(?: \d+)?\.md$/;

function filePath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

function draftRelativePath(path: string) {
  const name = getFilename(path);
  if (!draftName.test(name)) return undefined;
  const directory = filePath(markdownStorage.directory(draftsFolder).uri).replace(/\/+$/, "");
  return path === `${directory}/${name}` ? `${draftsFolder}/${name}` : undefined;
}

export function isMarkdownDraft(path: string) {
  return draftRelativePath(path) !== undefined;
}

export function createMarkdownDraft() {
  markdownStorage.ensureDirectory(draftsFolder);
  const names = new Set(markdownStorage.list(draftsFolder).map(entry => entry.name));
  let name = "Untitled.md";
  for (let number = 2; names.has(name); number++) name = `Untitled ${number}.md`;
  const relativePath = `${draftsFolder}/${name}`;
  const path = filePath(markdownStorage.file(relativePath).uri);
  markdownStorage.write(relativePath, "", { format: "text" });
  return path;
}

export function removeMarkdownDraft(path: string) {
  const relativePath = draftRelativePath(path);
  if (!relativePath) return;
  markdownStorage.delete(relativePath);
  if (pathExists(path)) throw new Error("Could not remove the Markdown draft.");
}
