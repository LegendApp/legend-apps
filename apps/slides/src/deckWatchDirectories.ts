export function deckWatchDirectories(deckPath: string, transitions: string, dependencies: readonly string[]) {
  const directory = (path: string) => path.slice(0, Math.max(1, path.lastIndexOf("/")));
  return [...new Set([directory(deckPath), transitions,
    ...dependencies.filter(path => path.endsWith("/pack.json")).map(directory)])].sort();
}
