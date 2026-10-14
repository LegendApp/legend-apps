import { list, readText, stat } from "@legendapp/spark/files";
import { alwaysIgnoredNames, isIgnored, parseGitignore, type IgnoreScope } from "./gitignore";

export type WorkspaceEntry = { isDirectory: boolean; name: string; path: string };
export type DirectoryListing = { entries: WorkspaceEntry[]; scopes: IgnoreScope[] };
export type WorkspaceTreeRow = WorkspaceEntry & { depth: number; expanded: boolean; parent: string | null };

export function getPathName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

function compareEntries(a: WorkspaceEntry, b: WorkspaceEntry) {
  return a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1;
}

/** Lists one directory, hiding ignored entries. Pass the parent's scopes so nested .gitignore files combine. */
export async function listWorkspaceDirectory(directory: string, parentScopes: readonly IgnoreScope[] = []): Promise<DirectoryListing> {
  const children = (await list(directory)).filter(({ name }) => !alwaysIgnoredNames.has(name));
  const gitignore = children.find(({ name }) => name === ".gitignore");
  const rules = gitignore ? parseGitignore(await readText(gitignore.path).catch(() => "")) : [];
  const scopes = rules.length > 0 ? [...parentScopes, { base: directory, rules }] : [...parentScopes];
  // Symlinks stay leaves, so a link cycle cannot recurse.
  const entries = await Promise.all(children.map(async ({ name, path }) => ({ isDirectory: (await stat(path)).type === "directory", name, path })));
  return { entries: entries.filter(entry => !isIgnored(scopes, entry.path, entry.isDirectory)).sort(compareEntries), scopes };
}

export function flattenWorkspaceTree(
  roots: readonly WorkspaceEntry[],
  listings: ReadonlyMap<string, DirectoryListing>,
  expanded: ReadonlySet<string>,
) {
  const rows: WorkspaceTreeRow[] = [];
  const visit = (entry: WorkspaceEntry, depth: number, parent: string | null) => {
    const isExpanded = entry.isDirectory && expanded.has(entry.path);
    rows.push({ ...entry, depth, expanded: isExpanded, parent });
    if (isExpanded) for (const child of listings.get(entry.path)?.entries ?? []) visit(child, depth + 1, entry.path);
  };
  for (const root of roots) visit(root, 0, null);
  return rows;
}
