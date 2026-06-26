import type { SyntaxStyle } from "./SyntaxParser.nitro";
import { getSyntaxTheme, getSyntaxThemeFile, normalizeSyntaxThemeName } from "./syntaxAssets";

export type SyntaxScopeEntry = {
  id: number;
  scopes: readonly string[];
};

type TextMateThemeRule = {
  scope?: unknown;
  settings?: unknown;
};

type TextMateThemeFile = {
  colors?: Record<string, unknown>;
  tokenColors?: unknown;
};

type ParsedThemeRule = {
  foreground?: string;
  fontStyle: number | undefined;
  index: number;
  parentScopes: string[];
  scope: string;
};

const fontStyleNone = 0;
const fontStyleItalic = 1;
const fontStyleBold = 2;
const fontStyleUnderline = 4;
const fontStyleStrikethrough = 8;

const resolverCache = new Map<string, ParsedThemeRule[]>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value);
}

function scopeMatches(scopeName: string, scopePattern: string) {
  return scopeName === scopePattern || scopeName.startsWith(`${scopePattern}.`);
}

function parseFontStyle(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  let fontStyle = fontStyleNone;
  for (const segment of value.split(/\s+/)) {
    if (segment === "italic") {
      fontStyle |= fontStyleItalic;
    } else if (segment === "bold") {
      fontStyle |= fontStyleBold;
    } else if (segment === "underline") {
      fontStyle |= fontStyleUnderline;
    } else if (segment === "strikethrough") {
      fontStyle |= fontStyleStrikethrough;
    }
  }
  return fontStyle;
}

function parseScopeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string");
  }
  if (typeof value === "string") {
    return value
      .replace(/^,+|,+$/g, "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
  }
  return [""];
}

function parseThemeRules(themeFile: unknown) {
  const theme = isObject(themeFile) ? themeFile as TextMateThemeFile : {};
  const tokenColors = Array.isArray(theme.tokenColors) ? theme.tokenColors : [];
  const rules: ParsedThemeRule[] = [];

  tokenColors.forEach((entry, index) => {
    const rule = isObject(entry) ? entry as TextMateThemeRule : {};
    const settings = isObject(rule.settings) ? rule.settings : {};
    const foreground = isHexColor(settings.foreground) ? settings.foreground : undefined;
    const fontStyle = parseFontStyle(settings.fontStyle);
    const scopeList = parseScopeList(rule.scope);

    for (const scopeValue of scopeList) {
      const segments = scopeValue.split(/\s+/).filter(Boolean);
      const scope = segments.at(-1) ?? "";
      const parentScopes = segments.slice(0, -1).reverse();
      rules.push({
        foreground,
        fontStyle,
        index,
        parentScopes,
        scope,
      });
    }
  });

  return rules;
}

function getThemeRules(themeName: string) {
  const normalizedThemeName = normalizeSyntaxThemeName(themeName);
  let rules = resolverCache.get(normalizedThemeName);
  if (!rules) {
    rules = parseThemeRules(getSyntaxThemeFile(normalizedThemeName));
    resolverCache.set(normalizedThemeName, rules);
  }
  return rules;
}

function parentScopesMatch(parentPath: readonly string[], parentScopes: readonly string[]) {
  let pathIndex = 0;
  for (let scopeIndex = 0; scopeIndex < parentScopes.length; scopeIndex += 1) {
    let scopePattern = parentScopes[scopeIndex];
    let scopeMustMatch = false;

    if (scopePattern === ">") {
      if (scopeIndex === parentScopes.length - 1) {
        return false;
      }
      scopePattern = parentScopes[scopeIndex + 1];
      scopeIndex += 1;
      scopeMustMatch = true;
    }

    let matched = false;
    while (pathIndex < parentPath.length && !matched) {
      matched = scopeMatches(parentPath[pathIndex], scopePattern);
      pathIndex += 1;
      if (scopeMustMatch && !matched) {
        return false;
      }
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

function compareRules(scopeIndex: number, rule: ParsedThemeRule, best: { rule: ParsedThemeRule; scopeIndex: number } | undefined) {
  if (!best) {
    return true;
  }

  const scopeDepth = rule.scope.split(".").length;
  const bestScopeDepth = best.rule.scope.split(".").length;
  if (scopeDepth !== bestScopeDepth) {
    return scopeDepth > bestScopeDepth;
  }

  if (rule.parentScopes.length !== best.rule.parentScopes.length) {
    return rule.parentScopes.length > best.rule.parentScopes.length;
  }

  if (scopeIndex !== best.scopeIndex) {
    return scopeIndex > best.scopeIndex;
  }

  return rule.index > best.rule.index;
}

type ResolvedScopeRules = {
  foreground?: ParsedThemeRule;
  fontStyle?: ParsedThemeRule;
};

function resolveScopeRules(rules: readonly ParsedThemeRule[], scopeStack: readonly string[]) {
  let bestForeground: { rule: ParsedThemeRule; scopeIndex: number } | undefined;
  let bestFontStyle: { rule: ParsedThemeRule; scopeIndex: number } | undefined;

  for (let scopeIndex = 0; scopeIndex < scopeStack.length; scopeIndex += 1) {
    const scopeName = scopeStack[scopeIndex];
    const parentPath = scopeStack.slice(0, scopeIndex).reverse();
    for (const rule of rules) {
      if (rule.scope && scopeMatches(scopeName, rule.scope) && parentScopesMatch(parentPath, rule.parentScopes)) {
        if (rule.foreground && compareRules(scopeIndex, rule, bestForeground)) {
          bestForeground = { rule, scopeIndex };
        }
        if (rule.fontStyle !== undefined && compareRules(scopeIndex, rule, bestFontStyle)) {
          bestFontStyle = { rule, scopeIndex };
        }
      }
    }
  }

  return {
    fontStyle: bestFontStyle?.rule,
    foreground: bestForeground?.rule,
  } satisfies ResolvedScopeRules;
}

export function resolveSyntaxScopeStyles(themeName: string, scopes: readonly SyntaxScopeEntry[]): SyntaxStyle[] {
  const rules = getThemeRules(themeName);
  const theme = getSyntaxTheme(themeName);

  return scopes.map((scopeEntry) => {
    const resolvedRules = resolveScopeRules(rules, scopeEntry.scopes);
    return {
      fontStyle: resolvedRules.fontStyle?.fontStyle ?? fontStyleNone,
      foreground: resolvedRules.foreground?.foreground ?? theme.foreground,
      id: scopeEntry.id,
    };
  });
}
