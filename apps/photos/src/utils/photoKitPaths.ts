export function photoKitAlbumPath(identifier: string, title: string) {
  return `photokit://${encodeURIComponent(identifier)}/${encodeURIComponent(title)}`;
}
export function photoKitAlbumIdentifier(path: string) {
  const value = path.slice("photokit://".length);
  // Legacy paths contained raw PhotoKit IDs (UUID/L0/040). Preserve saved selections.
  const legacy = value.match(/^([^/]+\/L\d+\/\d+)(?:\/|$)/);
  return legacy ? legacy[1] : decodeURIComponent(value.split("/")[0]);
}
