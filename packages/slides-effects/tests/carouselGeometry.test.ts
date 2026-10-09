// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { carouselCardLayout } from "../packs/media/CarouselGeometry";

test("filmstrips use the supplied item count and scale independently of the talk stage", () => {
  for (const geometry of [{ count: 24 }, { count: 24, centerX: 500, centerY: 320, spacing: 450 }]) {
    const selected = carouselCardLayout(20, "filmstrip", 20, 800, geometry);
    const neighbor = carouselCardLayout(21, "filmstrip", 20, 800, geometry);
    expect(selected.x).toBe(geometry.centerX ?? 960);
    expect(selected.y).toBe(geometry.centerY ?? 555);
    expect(selected.width).toBe(800);
    expect(neighbor.x - selected.x).toBe(geometry.spacing ?? 900);
    expect(neighbor.width).toBe(800 * 0.62);
  }
});

test("grids center arbitrary row and column counts within caller geometry", () => {
  const geometry = { count: 8, centerX: 500, gridCenterY: 300, gridColumns: 4, gridColumnSpacing: 200, gridRowSpacing: 180, gridCardWidth: 160 };
  expect(carouselCardLayout(0, "grid", 0, 800, geometry)).toMatchObject({ x: 200, y: 210, width: 160 });
  expect(carouselCardLayout(7, "grid", 0, 800, geometry)).toMatchObject({ x: 800, y: 390, width: 160 });
});
