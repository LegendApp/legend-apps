import { createObservableFile } from "@legend-desktop/storage";
import type { DiffOpenSource } from "./diffFiles";

const maxRecentSources = 12;

export type RecentDiffSource = {
  id: string;
  lastOpenedAt: number;
  source: DiffOpenSource;
};

type DiffAppMetadata = {
  recentSources: RecentDiffSource[];
};

export const diffAppMetadata$ = createObservableFile<DiffAppMetadata>({
  filename: "app-metadata",
  initialValue: {
    recentSources: [],
  },
});

export function getDiffSourceRecentId(source: DiffOpenSource) {
  if (source.kind === "github") {
    return `${source.kind}:${source.value}`;
  }
  if (source.kind === "git") {
    return `${source.kind}:${source.cwd}:${source.args.join("\u0000")}`;
  }
  return `${source.kind}:${source.value}`;
}

export function getRecentDiffSources() {
  return diffAppMetadata$.recentSources.peek() ?? [];
}

export function addRecentDiffSource(source: DiffOpenSource) {
  const id = getDiffSourceRecentId(source);
  const existing = getRecentDiffSources().filter((item) => item.id !== id);
  diffAppMetadata$.recentSources.set([
    {
      id,
      lastOpenedAt: Date.now(),
      source,
    },
    ...existing,
  ].slice(0, maxRecentSources));
}
