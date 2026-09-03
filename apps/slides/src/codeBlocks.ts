const supportedCodeLanguages = new Set([
  "bash",
  "c",
  "cpp",
  "css",
  "dockerfile",
  "go",
  "html",
  "java",
  "javascript",
  "js",
  "json",
  "jsx",
  "kotlin",
  "markdown",
  "md",
  "python",
  "ruby",
  "rust",
  "scss",
  "shellscript",
  "sh",
  "swift",
  "toml",
  "tsx",
  "typescript",
  "ts",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

export function getCodeLanguage(className: unknown) {
  if (typeof className !== "string") {
    return undefined;
  }
  const match = className.match(/(?:^|\s)language-([^\s]+)/);
  const language = match?.[1]?.toLowerCase();
  return language && supportedCodeLanguages.has(language) ? language : undefined;
}

export function getCodeSource(children: unknown): string | undefined {
  if (typeof children === "string" || typeof children === "number") {
    return String(children).replace(/\n$/, "");
  }
  if (Array.isArray(children)) {
    const parts = children.map(getCodeSource);
    return parts.every((part) => part !== undefined) ? parts.join("") : undefined;
  }
  return undefined;
}
