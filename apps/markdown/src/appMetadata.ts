import { createObservableFile } from "@legend-desktop/storage";

const maxRecentFiles = 20;

export type RecentMarkdownFile = {
  path: string;
  title: string;
  lastOpenedAt: number;
};

type MarkdownAppMetadata = {
  recentFiles: RecentMarkdownFile[];
};

export const markdownAppMetadata$ = createObservableFile<MarkdownAppMetadata>({
  filename: "app-metadata",
  initialValue: {
    recentFiles: [],
  },
});

export function getMarkdownFileTitle(path: string) {
  return path.split("/").pop() ?? path;
}

export function getRecentMarkdownFiles() {
  return markdownAppMetadata$.recentFiles.peek() ?? [];
}

export function addRecentMarkdownFile(path: string) {
  const title = getMarkdownFileTitle(path);
  const existing = getRecentMarkdownFiles().filter((file) => file.path !== path);
  markdownAppMetadata$.recentFiles.set([
    {
      path,
      title,
      lastOpenedAt: Date.now(),
    },
    ...existing,
  ].slice(0, maxRecentFiles));
}

export function removeRecentMarkdownFile(path: string) {
  markdownAppMetadata$.recentFiles.set(getRecentMarkdownFiles().filter((file) => file.path !== path));
}
