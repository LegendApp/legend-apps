export type CodeToken = { content: string; color: string; offset: number; id: string };
export type CodeHighlight = { tokens: CodeToken[]; foreground: string; background: string; version: string };
