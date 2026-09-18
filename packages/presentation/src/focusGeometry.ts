import type { FocusTransition, SlideConfig, SlideTransition } from "./types";

export type FocusRect = { x: number; y: number; width: number; height: number };
export type FocusCamera = { x: number; y: number; scale: number };
export const identityCamera: FocusCamera = { x: 0, y: 0, scale: 1 };

export function validFocusRect(rect: FocusRect) {
  return Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

export function normalizeTransition(value: unknown): SlideTransition | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && ("name" in value || "source" in value)) return value as SlideTransition;
  if (!value || typeof value !== "object") return undefined;
  const config = value as Partial<FocusTransition>;
  if (config.type !== "focus" || typeof config.from !== "string" || !config.from.trim()) return undefined;
  return {
    type: "focus", from: config.from,
    duration: typeof config.duration === "number" && Number.isFinite(config.duration)
      ? Math.max(0, Math.min(config.duration, 10000)) : 850,
  };
}

/** A focus transition belongs to an adjacent edge, including its reverse. */
export function resolveTransition(from: number, to: number, slides: { metadata: SlideConfig }[], fallback?: SlideTransition) {
  const incoming = normalizeTransition(slides[to]?.metadata.transition ?? fallback) ?? "none";
  const reverse = to === from - 1;
  const edge = reverse ? normalizeTransition(slides[from]?.metadata.transition ?? fallback) : incoming;
  const focus = Math.abs(to - from) === 1 && typeof edge === "object" && "type" in edge && edge.type === "focus" ? edge : undefined;
  return {
    kind: focus ? "focus" as const : typeof incoming === "object" ? "type" in incoming ? "fade" as const : incoming.source ?? incoming.name ?? "none" : incoming,
    reference: incoming,
    focus, reverse, duration: focus?.duration ?? (incoming === "reveal-up" ? 650 : 320),
  };
}

/** Uniform cover zoom: center the region without stretching its contents. */
export function focusCamera(region: FocusRect, stage: { width: number; height: number }): FocusCamera {
  const scale = Math.max(1, Math.max(stage.width / region.width, stage.height / region.height));
  return { scale, x: stage.width / 2 - (region.x + region.width / 2) * scale,
    y: stage.height / 2 - (region.y + region.height / 2) * scale };
}
