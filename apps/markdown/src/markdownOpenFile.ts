import { getPathName } from "@legend-apps/workspace";

export type OpenFileResult = { directory: string; name: string; path: string };

const maxRecentResults = 10;
const maxResults = 50;

/** The root folder's name, with as many parent folders as tell it apart from other roots of the same name. */
function getRootLabel(root: string, folders: readonly string[]) {
  const parts = root.split("/").filter(Boolean);
  for (let count = 1; ; count++) {
    const label = parts.slice(-count).join("/");
    if (count >= parts.length || !folders.some(folder => folder !== root && folder.endsWith(`/${label}`))) return label;
  }
}

const label = ({ directory, name }: OpenFileResult) => `${directory}/${name}`;

/** The file's folder, from its root folder's name, so files sharing a name tell apart. */
function describe(path: string, folders: readonly string[]): OpenFileResult {
  const root = folders.filter(folder => path.startsWith(`${folder}/`)).sort((a, b) => b.length - a.length)[0];
  const relative = root ? `${getRootLabel(root, folders)}/${path.slice(root.length + 1)}` : path;
  return { directory: relative.slice(0, relative.lastIndexOf("/")), name: getPathName(path), path };
}

/** Describes `files`; overlapping roots can still give two files the same label, and those show their full folder. */
function describeAll(files: readonly string[], folders: readonly string[]) {
  const results = files.map(path => describe(path, folders));
  const counts = new Map<string, number>();
  for (const key of results.map(label)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return new Map(results.map(result => [
    result.path,
    counts.get(label(result))! > 1 ? { ...result, directory: result.path.slice(0, result.path.lastIndexOf("/")) } : result,
  ]));
}

/**
 * Open File's results: with no query, the recent files among `files`, newest first; otherwise the files whose
 * folder-relative path holds every word of the query, names that start with or hold it first, then recent ones.
 */
export function findOpenFileResults(files: readonly string[], folders: readonly string[], recents: readonly string[], query: string): OpenFileResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const described = describeAll(files, folders);
  if (words.length === 0) return recents.flatMap(path => described.get(path) ?? []).slice(0, maxRecentResults);
  const recency = new Map(recents.map((path, index) => [path, index]));
  const rank = ({ name, path }: OpenFileResult) => {
    const lower = name.toLowerCase();
    const nameRank = lower.startsWith(words[0]) ? 0 : words.every(word => lower.includes(word)) ? 1 : 2;
    return [nameRank, recency.get(path) ?? recents.length] as const;
  };
  return [...described.values()]
    .filter(result => words.every(word => label(result).toLowerCase().includes(word)))
    .map(result => ({ rank: rank(result), result }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.result.path.localeCompare(b.result.path))
    .slice(0, maxResults)
    .map(({ result }) => result);
}
