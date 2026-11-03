import type { PlaybackState } from "@legend-apps/presentation";
import { easeProgress, type CameraPose, type Vec3 } from "./camera";
import { prepareWorldScene, worldHeaderSize, worldInstanceSize, type PreparedWorldScene } from "./scene";

/** Camera points are local to the incoming station; via points are quadratic controls. */
export type WorldTrack = {
  spacing?: number; duration?: number;
  position?: Vec3; target?: Vec3; via?: Vec3; viaTarget?: Vec3;
};
type Station = { offset: number; track: WorldTrack };
export type TrackFrame = {
  key: string; slideKey: string; origin: number; cursor: number; morphDuration: number;
  stations: Record<number, Station>; ids: string[]; declared: string[];
  from: number[]; sources: number[]; retired: Record<string, number[]>; values: number[];
};

export function createTrackFrame(): TrackFrame {
  "worklet";
  return { key: "", slideKey: "", origin: 0, cursor: 0, morphDuration: 0,
    stations: {}, ids: [], declared: [], from: [], sources: [], retired: {}, values: [] };
}

/** Geometry families are matched separately: packed label data must never become mesh data. */
export function trackIds(scene: PreparedWorldScene): string[] {
  return scene.instances.map(part => `${part.label ? "label" : part.card ? "card" : part.glyph ? "glyph" : part.kind}:${part.id ?? ""}`);
}

/** Keep draw descriptors so an omitted object can remain visible, then return on reverse. */
export function retainTrackScene(scene: PreparedWorldScene, previous: PreparedWorldScene): PreparedWorldScene {
  const ids = trackIds(scene), oldIds = trackIds(previous);
  const omitted = previous.instances.filter((part, index) => part.id && !ids.includes(oldIds[index]));
  return omitted.length ? prepareWorldScene({ ...scene, instances: [...scene.instances, ...omitted] }) : scene;
}

function quadratic(a: Vec3, control: Vec3, b: Vec3, t: number): Vec3 {
  "worklet";
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * control[2] + t * t * b[2]];
}
function stationAt(stations: Record<number, Station>, index: number, spacing: number): Station {
  "worklet";
  return stations[index] ?? { offset: index * spacing, track: {} };
}
function worldPoint(point: Vec3, offset: number): Vec3 {
  "worklet";
  return [point[0], point[1], point[2] - offset];
}
/** The rail is sampled by station coordinate, so reversing retraces the same curve. */
function sampleTrackCamera(stations: Record<number, Station>, cursor: number, spacing: number): CameraPose {
  "worklet";
  const endIndex = Math.max(1, Math.ceil(cursor)), t = cursor - (endIndex - 1);
  const start = stationAt(stations, endIndex - 1, spacing), end = stationAt(stations, endIndex, spacing);
  const position = quadratic(worldPoint(start.track.position ?? [0, 3.6, 14], start.offset),
    worldPoint(end.track.via ?? [2.5, 5.5, (end.offset - start.offset) * 0.6875], end.offset),
    worldPoint(end.track.position ?? [0, 3.6, 14], end.offset), t);
  const target = quadratic(worldPoint(start.track.target ?? [0, 0, 0], start.offset),
    worldPoint(end.track.viaTarget ?? [0, 0, (end.offset - start.offset) * 0.3125], end.offset),
    worldPoint(end.track.target ?? [0, 0, 0], end.offset), t);
  return { position, target, fov: 40, roll: 0 };
}

/** UI-thread sampling. The caller supplies a fresh uniform buffer, keeping the scene cache untouched. */
export function sampleTrackFrame(previous: TrackFrame, values: number[], ids: string[], playback: PlaybackState,
  options: WorldTrack, declared = ids): TrackFrame {
  "worklet";
  const preview = playback.phase === "preview" || playback.phase === "preparing";
  if (!preview && (playback.phase === "paused" || playback.phase === "outgoing")) return previous;
  const key = `${playback.slideKey}/${playback.stepKey}`;
  const changed = key !== previous.key, slideChanged = playback.slideKey !== previous.slideKey;
  const first = !previous.key || preview;
  // Activation epochs change on re-entry; the slide's numeric index is its stable station identity.
  const index = preview ? 0 : Number(playback.slideKey.split(":")[0]);
  const spacing = options.spacing ?? 32;
  const stations = first ? {} : slideChanged ? { ...previous.stations } : previous.stations;
  if (first || slideChanged && !stations[index]) stations[index] = { offset: index * spacing, track: options };
  const origin = first ? index : slideChanged ? previous.cursor : previous.origin;
  const duration = options.duration ?? 1.7;
  const travelDuration = Math.max(1, Math.abs(index - origin)) * (stations[Math.max(index, Math.ceil(origin))]?.track.duration ?? duration);
  const travel = first ? 1 : easeProgress(playback.slideTime / travelDuration, "cubic");
  const cursor = origin + (index - origin) * travel;
  const camera = sampleTrackCamera(stations, cursor, spacing);
  const station = stations[index].offset;
  const retired = changed ? { ...previous.retired } : previous.retired;
  const from = changed ? previous.values.slice() : previous.from;
  if (changed) for (let slot = 0; slot < previous.ids.length; slot++) {
    const id = previous.ids[slot], at = worldHeaderSize + slot * worldInstanceSize;
    if (previous.declared.includes(id) && !declared.includes(id)) retired[id] = previous.values.slice(at, at + worldInstanceSize);
    if (previous.declared.includes(id) && declared.includes(id)) delete retired[id];
    const saved = retired[id];
    if (saved) for (let field = 0; field < worldInstanceSize; field++) from[at + field] = saved[field];
  }
  const morphDuration = changed ? slideChanged ? travelDuration : duration : previous.morphDuration;
  const progress = first || from.length === 0 ? 1 : easeProgress(playback.stepTime / morphDuration, "cubic");
  const sources = changed ? ids.map(id => id.slice(id.indexOf(":") + 1) ? previous.ids.indexOf(id) : -1) : previous.sources;
  values[0] = camera.position[0]; values[1] = camera.position[1]; values[2] = camera.position[2];
  values[3] = Math.tan(camera.fov * Math.PI / 360);
  values[4] = camera.target[0]; values[5] = camera.target[1]; values[6] = camera.target[2]; values[7] = camera.roll;
  values[32] = Math.hypot(camera.position[0] - camera.target[0], camera.position[1] - camera.target[1], camera.position[2] - camera.target[2]);
  // Lights travel with the station; floor markings stay in world space.
  for (let light = 0; light < 4; light++) values[64 + light * 12 + 2] -= station;
  values[114] -= station;
  values[122] -= station;
  for (let slot = 0; slot < ids.length; slot++) {
    const at = worldHeaderSize + slot * worldInstanceSize, id = ids[slot];
    if (!declared.includes(id)) {
      const saved = retired[id];
      if (saved) {
        for (let field = 0; field < worldInstanceSize; field++) values[at + field] = saved[field];
        const dx = saved[0] - camera.position[0], dy = saved[1] - camera.position[1], dz = saved[2] - camera.position[2];
        const depth = dx * (camera.target[0] - camera.position[0]) + dy * (camera.target[1] - camera.position[1]) + dz * (camera.target[2] - camera.position[2]);
        let radius = Math.abs(saved[3]) * (id.startsWith("label:") ? Math.hypot(1, saved[8]) : Math.hypot(saved[8], saved[9], saved[10]));
        if (id.startsWith("tube:")) radius += Math.hypot(saved[12] - saved[0], saved[13] - saved[1], saved[14] - saved[2]) *
          (1 + Math.abs(saved[15])) * Math.max(Math.abs(saved[8]), Math.abs(saved[9]), Math.abs(saved[10]));
        if (depth < -radius * values[32]) values[at + 23] = 0;
      } else values[at + 23] = 0;
      continue;
    }
    values[at + 2] -= station;
    // Hidden titles must not expand to the height of their destination column.
    const label = id.startsWith("label:");
    if (label && values[at + 23] === 0) values[at + 3] = 0;
    if (id.startsWith("tube:")) values[at + 14] -= station;
    const source = sources[slot] ?? -1;
    if (progress < 1 && source >= 0) {
      const old = worldHeaderSize + source * worldInstanceSize;
      for (let field = 0; field < (label ? 8 : 11); field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (!label) for (let field = 24; field < 27; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      if (id.startsWith("tube:")) for (let field = 12; field < 15; field++) values[at + field] = from[old + field] + (values[at + field] - from[old + field]) * progress;
      values[at + 23] = from[old + 23] + (values[at + 23] - from[old + 23]) * progress;
    } else if (!first && progress < 1) values[at + 23] *= progress;
  }
  return { key, slideKey: playback.slideKey, origin, cursor, morphDuration,
    stations, ids, declared, from, sources, retired, values };
}
