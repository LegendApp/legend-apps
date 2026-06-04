import { createNativeSettingsPersistPlugin } from "@legend-desktop/app-settings";
import { observable } from "@legendapp/state";
import { synced } from "@legendapp/state/sync";

const maxRecentFiles = 20;

export type RecentMarkdownFile = {
  path: string;
  title: string;
  lastOpenedAt: number;
};

type MarkdownAppMetadata = {
  recentFiles: RecentMarkdownFile[];
};

export const markdownAppMetadata$ = observable<MarkdownAppMetadata>(
  synced({
    initial: {
      recentFiles: [],
    },
    persist: {
      name: "app-metadata",
      plugin: createNativeSettingsPersistPlugin({ prefix: "legend.markdown." }),
    },
  }),
);

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
