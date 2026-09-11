export type SourceProgress = { completedLines: number; totalLines: number; active: boolean };
export const sourceProgressThreshold = 10000;

export function progressLabel(progress: SourceProgress, loading: boolean): string | null {
  if (progress.totalLines < sourceProgressThreshold) return null;
  if (loading) return `Loading file… ${progress.totalLines.toLocaleString()} lines`;
  if (!progress.active) return null;
  const percent = Math.min(99, Math.max(0, Math.floor(progress.completedLines / progress.totalLines * 100)));
  return `Highlighting… ${percent}% · ${progress.completedLines.toLocaleString()} / ${progress.totalLines.toLocaleString()} lines`;
}

// A native-event adapter keeps progress updates in the banner, not the row tree.
export function createSourceProgress() {
  let snapshot: SourceProgress = { completedLines: 0, totalLines: 0, active: false };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(next: SourceProgress) {
      if (next.completedLines === snapshot.completedLines && next.totalLines === snapshot.totalLines && next.active === snapshot.active) return;
      snapshot = next; listeners.forEach((listener) => listener());
    },
  };
}
