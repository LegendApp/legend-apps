export type Bounds = { x: number; y: number; width: number; height: number };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function relativeBounds(target: Bounds, host: Bounds, size: { width: number; height: number }): Bounds {
  const scaleX = host.width / size.width || 1;
  const scaleY = host.height / size.height || 1;
  return { x: (target.x - host.x) / scaleX, y: (target.y - host.y) / scaleY,
    width: target.width / scaleX, height: target.height / scaleY };
}

export function calloutBounds(target: Bounds, size: { width: number; height: number }, width: number, height: number,
  side: "above" | "below" | "left" | "right", gap = 34): Bounds {
  const x = side === "left" ? target.x - width - gap : side === "right" ? target.x + target.width + gap : target.x + (target.width - width) / 2;
  const y = side === "above" ? target.y - height - gap : side === "below" ? target.y + target.height + gap : target.y + (target.height - height) / 2;
  return { x: clamp(x, 12, size.width - width - 12), y: clamp(y, 12, size.height - height - 12), width, height };
}
