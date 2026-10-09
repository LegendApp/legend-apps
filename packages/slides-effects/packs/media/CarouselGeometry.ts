export type SceneMode = "hero" | "grid" | "filmstrip";
export type CarouselGeometry = { count: number; centerX?: number; centerY?: number; spacing?: number; gridColumns?: number; gridCenterY?: number; gridColumnSpacing?: number; gridRowSpacing?: number; gridCardWidth?: number };
export function carouselCardLayout(index: number, mode: SceneMode, position: number, width: number, {
  count, centerX = 960, centerY = 555, spacing = 900, gridColumns = 3, gridCenterY = 550,
  gridColumnSpacing = 440, gridRowSpacing = 265, gridCardWidth = 380,
}: CarouselGeometry) {
  if (mode === "hero") return { x: centerX, y: centerY, width, opacity: 1, depth: index === 0 ? 100 : count - index };
  if (mode === "grid") {
    const columns = Math.max(1, Math.floor(gridColumns));
    return { x: centerX + (index % columns - (columns - 1) / 2) * gridColumnSpacing,
      y: gridCenterY + (Math.floor(index / columns) - (Math.ceil(count / columns) - 1) / 2) * gridRowSpacing,
      width: gridCardWidth, opacity: 1, depth: index === 0 ? 100 : count - index };
  }
  const distance = index - Math.max(0, Math.min(count - 1, position));
  const magnitude = Math.abs(distance);
  const scale = 1 - 0.38 * Math.min(1, magnitude) - 0.1 * Math.min(1, Math.max(0, magnitude - 1));
  return { x: centerX + distance * spacing, y: centerY, width: width * scale,
    opacity: magnitude < 1 ? 1 - magnitude * 0.3 : Math.max(0.25, 0.7 - (magnitude - 1) * 0.2),
    depth: Math.round(100 - magnitude * 10) };
}
