import { getPathName } from "@legend-apps/workspace";

export type OpenFileResult = { directory: string; name: string; path: string };

const maxRecentResults = 10;
const maxResults = 50;

/** The file's folder, from its root folder's name, so files sharing a name tell apart. */
function describe(path: string, folders: readonly string[]): OpenFileResult {
  const root = folders.filter(folder => path.startsWith(`${folder}/`)).sort((a, b) => b.length - a.length)[0];
  const relative = root ? `${getPathName(root)}/${path.slice(root.length + 1)}` : path;
  return { directory: relative.slice(0, relative.lastIndexOf("/")), name: getPathName(path), path };
}

/**
 * Open File's results: with no query, the recent files among `files`, newest first; otherwise the files whose
 * folder-relative path holds every word of the query, names that start with or hold it first, then recent ones.
 */
export function findOpenFileResults(files: readonly string[], folders: readonly string[], recents: readonly string[], query: string): OpenFileResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const inScope = new Set(files);
  if (words.length === 0) return recents.filter(path => inScope.has(path)).slice(0, maxRecentResults).map(path => describe(path, folders));
  const recency = new Map(recents.map((path, index) => [path, index]));
  const rank = ({ name, path }: OpenFileResult) => {
    const lower = name.toLowerCase();
    const nameRank = lower.startsWith(words[0]) ? 0 : words.every(word => lower.includes(word)) ? 1 : 2;
    return [nameRank, recency.get(path) ?? recents.length] as const;
  };
  return files
    .map(path => describe(path, folders))
    .filter(result => words.every(word => `${result.directory}/${result.name}`.toLowerCase().includes(word)))
    .map(result => ({ rank: rank(result), result }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.result.path.localeCompare(b.result.path))
    .slice(0, maxResults)
    .map(({ result }) => result);
}
