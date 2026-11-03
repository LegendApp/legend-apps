import type { PlaybackState } from "@legend-apps/presentation";
import { easeProgress } from "./camera";
import { worldHeaderSize, worldInstanceSize, type PreparedWorldScene } from "./scene";

export type WorldTrack = { spacing?: number; duration?: number; cruise?: number };
export type TrackFrame = {
  key: string; station: number; origin: number; distance: number;
  ids: string[]; from: number[]; sources: number[]; values: number[];
};

export function createTrackFrame(): TrackFrame {
  "worklet";
  return { key: "", station: 0, origin: 0, distance: 0, ids: [], from: [], sources: [], values: [] };
}

/** Geometry families are matched separately: packed label data must never become mesh data. */
export function trackIds(scene: PreparedWorldScene): string[] {
  return scene.instances.map(part => `${part.label ? "label" : part.card ? "card" : part.glyph ? "glyph" : part.kind}:${part.id ?? ""}`);
}

/** UI-thread sampling. The caller supplies a fresh uniform buffer, keeping the scene cache untouched. */
export function sampleTrackFrame(previous: TrackFrame, values: number[], ids: string[], playback: PlaybackState,
  options: WorldTrack, previewTime: number): TrackFrame {
  "worklet";
  const preview = playback.phase === "preview" || playback.phase === "preparing";
  if (!preview && (playback.phase === "paused" || playback.phase === "outgoing")) return previous;
  const key = `${playback.slideKey}/${playback.stepKey}`;
  const changed = key !== previous.key;
  const first = !previous.key || preview;
  const origin = changed ? previous.distance : previous.origin;
  const station = first ? 0 : changed ? origin + (options.spacing ?? 18) : previous.station;
  const from = changed ? previous.values : previous.from;
  const sources = changed ? ids.map(id => id.slice(id.indexOf(":") + 1) ? previous.ids.indexOf(id) : -1) : previous.sources;
  const elapsed = preview ? playback.phase === "preparing" ? 0 : previewTime : playback.stepTime;
  const progress = first || from.length === 0 ? 1 : easeProgress(elapsed / (options.duration ?? 1.5), "smoothstep");
  const distance = preview ? 0 : origin + (station - origin) * progress + elapsed * (options.cruise ?? 0.12);
  // Fixed heading and height: navigation, including Previous, only increases track distance.
  values[0] = 0; values[1] = 4; values[2] = 18 - distance;
  values[3] = Math.tan(42 * Math.PI / 360);
  values[4] = 0; values[5] = 0; values[6] = -distance; values[7] = 0;
  values[32] = Math.hypot(4, 18);
  // Lights travel with the station; floor markings stay in world space.
  for (let light = 0; light < 4; light++) values[64 + light * 12 + 2] -= station;
  values[114] -= station;
  values[122] -= station;
  for (let slot = 0; slot < ids.length; slot++) {
    const at = worldHeaderSize + slot * worldInstanceSize;
    values[at + 2] -= station;
    // Hidden titles must not expand to the height of their destination column.
    if (ids[slot].startsWith("label:") && values[at + 23] === 0) values[at + 3] = 0;
    if (ids[slot].startsWith("tube:")) values[at + 14] -= station;
    const source = sources[slot] ?? -1;
    if (progress < 1 && source >= 0) {
      const old = worldHeaderSize + source * worldInstanceSize;
      // Position, radius, color and emission are common to meshes and labels.
      const label = ids[slot].startsWith("label:");
      for (let field = 0; field < (label ? 8 : 11); field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (!label) for (let field = 24; field < 27; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (ids[slot].startsWith("tube:")) {
        for (let field = 12; field < 15; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      }
      values[at + 23] = from[old + 23] + (values[at + 23] - from[old + 23]) * progress;
    } else if (!first && progress < 1) values[at + 23] *= progress;
  }
  return { key, station, origin: first ? 0 : origin, distance, ids, from, sources, values };
}
