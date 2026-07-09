import { createObservableFile } from "@legend-apps/storage";
import type { WindowFrame } from "@legend-apps/window-manager";
import type { DiffOpenSource } from "./diffFiles";

const maxRecentSources = 12;
const maxSavedWindows = 20;

export type RecentDiffSource = {
  id: string;
  lastOpenedAt: number;
  source: DiffOpenSource;
};

export type SavedDiffWindow = {
  frame?: WindowFrame;
  id: string;
  lastOpenedAt: number;
  source?: DiffOpenSource;
};

type DiffAppMetadata = {
  recentSources: RecentDiffSource[];
  savedWindows?: SavedDiffWindow[];
};

export const diffAppMetadata$ = createObservableFile<DiffAppMetadata>({
  filename: "app-metadata",
  initialValue: {
    recentSources: [],
    savedWindows: [],
  },
});

export function getDiffSourceRecentId(source: DiffOpenSource) {
  if (source.kind === "github") {
    return `${source.kind}:${source.value}`;
  }
  if (source.kind === "git") {
    return `${source.kind}:${source.cwd}:${source.args.join("\u0000")}`;
  }
  if (source.kind === "filePair") {
    return `${source.kind}:${source.oldPath}\u0000${source.newPath}`;
  }
  if (source.kind === "diffFile") {
    return `${source.kind}:${source.value}`;
  }
  return `${source.kind}:${source.value}`;
}

export function getRecentDiffSources() {
  return diffAppMetadata$.recentSources.peek() ?? [];
}

function normalizeSavedWindowFrame(frame: unknown): WindowFrame | undefined {
  if (!frame || typeof frame !== "object") {
    return undefined;
  }
  const candidate = frame as Partial<WindowFrame>;
  const { height, width, x, y } = candidate;
  return typeof height === "number" &&
    typeof width === "number" &&
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(height) &&
    Number.isFinite(width) &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    height > 0 &&
    width > 0
    ? { height, width, x, y }
    : undefined;
}

function normalizeSavedDiffWindow(window: SavedDiffWindow): SavedDiffWindow {
  const frame = normalizeSavedWindowFrame(window.frame);
  return {
    id: window.id,
    lastOpenedAt: typeof window.lastOpenedAt === "number" ? window.lastOpenedAt : Date.now(),
    ...(frame ? { frame } : {}),
    ...(window.source ? { source: window.source } : {}),
  };
}

export function getSavedDiffWindows() {
  const savedWindows = diffAppMetadata$.savedWindows.peek() ?? [];
  return savedWindows
    .filter((window): window is SavedDiffWindow => Boolean(window?.id))
    .map(normalizeSavedDiffWindow)
    .slice(0, maxSavedWindows);
}

function setSavedDiffWindows(savedWindows: readonly SavedDiffWindow[]) {
  diffAppMetadata$.savedWindows.set(savedWindows.map(normalizeSavedDiffWindow).slice(0, maxSavedWindows));
}

export function upsertSavedDiffWindow(window: { frame?: WindowFrame; id: string; source?: DiffOpenSource }) {
  const existing = getSavedDiffWindows().filter((item) => item.id !== window.id);
  setSavedDiffWindows([
    normalizeSavedDiffWindow({
      frame: window.frame,
      id: window.id,
      lastOpenedAt: Date.now(),
      source: window.source,
    }),
    ...existing,
  ]);
}

export function updateSavedDiffWindowSource(id: string, source: DiffOpenSource) {
  const savedWindows = getSavedDiffWindows();
  const existingWindow = savedWindows.find((window) => window.id === id);
  if (existingWindow) {
    setSavedDiffWindows(savedWindows.map((window) =>
      window.id === id
        ? {
          ...window,
          source,
        }
        : window,
    ));
  } else {
    upsertSavedDiffWindow({ id, source });
  }
}

export function updateSavedDiffWindowFrame(id: string, frame: WindowFrame) {
  const normalizedFrame = normalizeSavedWindowFrame(frame);
  if (normalizedFrame) {
    setSavedDiffWindows(
      getSavedDiffWindows().map((window) =>
        window.id === id
          ? {
            ...window,
            frame: normalizedFrame,
          }
          : window,
      ),
    );
  }
}

export function removeSavedDiffWindow(id: string) {
  setSavedDiffWindows(getSavedDiffWindows().filter((window) => window.id !== id));
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
