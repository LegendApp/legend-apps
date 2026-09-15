export function isMarkdownFileConflictError(error: unknown): boolean {
  return String(error).includes("MARKDOWN_FILE_CONFLICT:");
}
