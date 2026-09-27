export function photoKitAlbumPath(identifier: string, title: string) {
  return `photokit://${encodeURIComponent(identifier)}/${encodeURIComponent(title)}`;
}
export function photoKitAlbumIdentifier(path: string) {
  const value = path.slice("photokit://".length);
  // Legacy paths contained raw PhotoKit IDs (UUID/L0/040). Preserve saved selections.
  const legacy = value.match(/^([^/]+\/L\d+\/\d+)(?:\/|$)/);
  return legacy ? legacy[1] : decodeURIComponent(value.split("/")[0]);
}

export function photoKitAlbumTitle(path: string) {
  const value = path.slice("photokit://".length);
  const legacy = value.match(/^[^/]+\/L\d+\/\d+(?:\/|$)/);
  // Old titles were unescaped and may contain literal slashes or percent signs.
  return legacy ? value.slice(legacy[0].length) : decodeURIComponent(value.slice(value.indexOf("/") + 1));
}
