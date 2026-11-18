import type { Density, GitSettings } from "./schema";

export type Appearance = "light" | "dark";

/** Row heights per density (spec §4): panels read these, never constants. The diff line is for code size 12. */
export const densityHeights: Record<Density, { row: number; sidebar: number; diffLine: number }> = {
  compact: { row: 20, sidebar: 24, diffLine: 16 },
  regular: { row: 24, sidebar: 28, diffLine: 18 },
  comfortable: { row: 28, sidebar: 32, diffLine: 20 },
};

/** A diff line's height for a density and code font size: the table's height, scaled from code size 12. */
export const diffLineHeight = (density: Density, codeSize: number) => Math.round(densityHeights[density].diffLine * codeSize / 12);

/**
 * The macOS system colors a `system:<name>` token can name, as hex per appearance. Native views that take strings
 * (the diff rows, SF Symbols) can't use a PlatformColor (A16), so tokens resolve to hex once per appearance.
 */
const systemColors: Record<string, [light: string, dark: string]> = {
  systemBlue: ["#007AFF", "#0A84FF"], systemPurple: ["#AF52DE", "#BF5AF2"], systemPink: ["#FF2D55", "#FF375F"],
  systemOrange: ["#FF9500", "#FF9F0A"], systemGreen: ["#28CD41", "#32D74B"], systemTeal: ["#30B0C7", "#40C8E0"],
  systemIndigo: ["#5856D6", "#5E5CE6"], systemBrown: ["#A2845E", "#AC8E68"], systemRed: ["#FF3B30", "#FF453A"],
  systemYellow: ["#FFCC00", "#FFD60A"], systemGray: ["#8E8E93", "#98989D"], systemMint: ["#00C7BE", "#63E6E2"], systemCyan: ["#32ADE6", "#64D2FF"],
  controlAccent: ["#007AFF", "#0A84FF"], link: ["#0068DA", "#419CFF"],
  label: ["#000000D9", "#FFFFFFD9"], secondaryLabel: ["#00000080", "#FFFFFF8C"], tertiaryLabel: ["#00000042", "#FFFFFF40"], quaternaryLabel: ["#00000019", "#FFFFFF19"],
  selectedContentBackground: ["#0063E1", "#0058D0"], unemphasizedSelectedContentBackground: ["#DCDCDC", "#464646"],
  separator: ["#0000001A", "#FFFFFF1A"], textBackground: ["#FFFFFF", "#1E1E1E"], windowBackground: ["#ECECEC", "#323232"], controlBackground: ["#FFFFFF", "#1E1E1E"],
};
const unknownColor: [string, string] = ["#8E8E93", "#98989D"];

/** "system:systemGreen" and "system:systemGreenColor" name the same color. */
export const isKnownSystemColor = (color: string) => !color.startsWith("system:") || Object.hasOwn(systemColors, color.slice(7).replace(/Color$/, ""));

/** A theme color as hex for one appearance; an unknown system name draws gray (validation reports it). */
export function resolveColor(color: string, appearance: Appearance): string {
  if (!color.startsWith("system:")) return color;
  const pair = systemColors[color.slice(7).replace(/Color$/, "")] ?? unknownColor;
  return pair[appearance === "dark" ? 1 : 0];
}

type Tokens = GitSettings["theme"]["light"];
/** The token names of a (loose) token group, each resolved to hex. */
type ResolvedRecord<T> = { readonly [K in keyof T as string extends K ? never : K]: string };
export type ResolvedTheme = Readonly<{
  appearance: Appearance;
  accent: string;
  status: ResolvedRecord<Tokens["status"]>;
  diff: ResolvedRecord<Tokens["diff"]>;
  /** The lane colors; the last one is the overflow color. */
  lanes: readonly string[];
  refs: ResolvedRecord<Tokens["refs"]>;
  codeFont: string;
  codeSize: number;
}>;

const resolveRecord = <T extends Record<string, unknown>>(record: T, appearance: Appearance) =>
  Object.freeze(Object.fromEntries(Object.entries(record).map(([key, value]) => [key, resolveColor(String(value), appearance)]))) as ResolvedRecord<T>;

/** "system-mono" is the system monospaced font; React Native and the diff rows know it as Menlo. */
export const codeFontFamily = (code: string) => code === "system-mono" ? "Menlo" : code;

/** The theme's tokens for one appearance, every color hex, frozen (spec §7 item 5): an appearance change swaps the object. */
export function resolveTheme(theme: GitSettings["theme"], appearance: Appearance): ResolvedTheme {
  const tokens = theme[appearance];
  return Object.freeze({
    appearance,
    accent: resolveColor(tokens.accent, appearance),
    status: resolveRecord(tokens.status, appearance),
    diff: resolveRecord(tokens.diff, appearance),
    lanes: Object.freeze(tokens.lanes.map(color => resolveColor(color, appearance))),
    refs: resolveRecord(tokens.refs, appearance),
    codeFont: codeFontFamily(theme.fonts.code),
    codeSize: theme.fonts.codeSize,
  });
}
