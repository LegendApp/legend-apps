const diffDarkPalette = {
  addAccent: "#7ee787",
  addBackground: "#17351f",
  removeAccent: "#ff7b72",
  removeBackground: "#3a1d24",
};

const diffLightPalette = {
  addAccent: "#1a7f37",
  addBackground: "#dafbe1",
  removeAccent: "#cf222e",
  removeBackground: "#ffebe9",
};

export const diffUnifiedChangeBarWidth = 3;
export const diffUnifiedLineNumberWidth = 44;
export const diffUnifiedMarkerWidth = 14;

export function getDiffRowPalette(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark" ? diffDarkPalette : diffLightPalette;
}
