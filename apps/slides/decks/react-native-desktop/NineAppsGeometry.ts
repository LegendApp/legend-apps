export const appOrder = ["react-native", "appkit", "swiftui", "electron", "tauri", "deno-webview", "deno-cef", "flutter", "gpui"] as const;
export type AppId = typeof appOrder[number];
export type SceneMode = "hero" | "grid" | "filmstrip";
// Keep RN in the middle of the grid and first in the filmstrip.
const gridPositions = [4, 0, 1, 2, 3, 5, 6, 7, 8];
export const filmstripHoldMs = 2800;
export const filmstripMoveMs = 1100;
export const filmstripLeadInMs = 1400;
const ease = (t: number) => t * t * (3 - 2 * t);

export function filmstripPosition(elapsed: number) {
  const time = Math.max(0, elapsed - filmstripLeadInMs);
  const period = filmstripHoldMs + filmstripMoveMs;
  const cycle = Math.floor(time / period);
  const progress = Math.max(0, (time % period - filmstripHoldMs) / filmstripMoveMs);
  return cycle + ease(progress);
}

export function appCardLayout(index: number, mode: SceneMode, position = 0) {
  if (mode === "hero") return { x: 960, y: 560, width: 1160, opacity: 1, depth: index === 0 ? 100 : 9 - index };
  if (mode === "grid") {
    const slot = gridPositions[index];
    return { x: 960 + (slot % 3 - 1) * 440, y: 550 + (Math.floor(slot / 3) - 1) * 265, width: 380, opacity: 1, depth: 10 };
  }
  const count = appOrder.length;
  const distance = (((index - position + count / 2) % count + count) % count) - count / 2;
  const magnitude = Math.abs(distance);
  const scale = 1 - 0.38 * Math.min(1, magnitude) - 0.1 * Math.min(1, Math.max(0, magnitude - 1));
  return { x: 960 + distance * 900, y: 555, width: 1180 * scale,
    opacity: magnitude < 1 ? 1 - magnitude * 0.3 : Math.max(0.25, 0.7 - (magnitude - 1) * 0.2),
    depth: Math.round(100 - magnitude * 10) };
}
