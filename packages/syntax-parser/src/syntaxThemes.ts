export type SyntaxThemeAppearance = "dark" | "light";

export type SyntaxTheme = {
  appearance: SyntaxThemeAppearance;
  background: string;
  foreground: string;
  label: string;
  name: string;
};

export const defaultSyntaxThemeName = "github-dark-dimmed";

export const bundledSyntaxThemes = [
  { name: "github-dark-dimmed", label: "GitHub Dark Dimmed", appearance: "dark", background: "#22272e", foreground: "#adbac7" },
  { name: "github-light", label: "GitHub Light", appearance: "light", background: "#fff", foreground: "#24292e" },
  { name: "dark-plus", label: "Dark Plus", appearance: "dark", background: "#1E1E1E", foreground: "#D4D4D4" },
  { name: "light-plus", label: "Light Plus", appearance: "light", background: "#FFFFFF", foreground: "#000000" },
  { name: "catppuccin-mocha", label: "Catppuccin Mocha", appearance: "dark", background: "#1e1e2e", foreground: "#cdd6f4" },
  { name: "catppuccin-latte", label: "Catppuccin Latte", appearance: "light", background: "#eff1f5", foreground: "#4c4f69" },
  { name: "dracula", label: "Dracula Theme", appearance: "dark", background: "#282A36", foreground: "#F8F8F2" },
  { name: "one-dark-pro", label: "One Dark Pro", appearance: "dark", background: "#282c34", foreground: "#abb2bf" },
  { name: "one-light", label: "One Light", appearance: "light", background: "#FAFAFA", foreground: "#383A42" },
  { name: "tokyo-night", label: "Tokyo Night", appearance: "dark", background: "#1a1b26", foreground: "#a9b1d6" },
  { name: "vitesse-dark", label: "Vitesse Dark", appearance: "dark", background: "#121212", foreground: "#dbd7caee" },
  { name: "vitesse-light", label: "Vitesse Light", appearance: "light", background: "#ffffff", foreground: "#393a34" },
  { name: "monokai", label: "Monokai", appearance: "dark", background: "#272822", foreground: "#f8f8f2" },
  { name: "nord", label: "Nord", appearance: "dark", background: "#2e3440", foreground: "#d8dee9" },
  { name: "rose-pine", label: "Rose Pine", appearance: "dark", background: "#191724", foreground: "#e0def4" },
] as const satisfies readonly SyntaxTheme[];

export type BundledSyntaxThemeName = (typeof bundledSyntaxThemes)[number]["name"];

export function getSyntaxTheme(name: string): SyntaxTheme {
  return bundledSyntaxThemes.find((theme) => theme.name === name) ?? bundledSyntaxThemes[0];
}

export function isBundledSyntaxThemeName(value: unknown): value is BundledSyntaxThemeName {
  return typeof value === "string" && bundledSyntaxThemes.some((theme) => theme.name === value);
}
