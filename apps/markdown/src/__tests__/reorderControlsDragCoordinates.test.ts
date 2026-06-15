import { resolveDragStartMetrics } from "../../../../packages/reorder-controls/src/dragCoordinates";

describe("reorder controls drag coordinates", () => {
  it("uses measured window origin and local touch coordinates for drag start", () => {
    const metrics = resolveDragStartMetrics(
      {
        locationX: 18,
        locationY: 9,
        pageX: 12,
        pageY: 24,
      },
      {
        height: 36,
        width: 92,
        x: 144,
        y: 318,
      },
    );

    expect(metrics).toEqual({
      itemWindowX: 144,
      itemWindowY: 318,
      pointerWindowX: 162,
      pointerWindowY: 327,
    });
  });

  it("falls back to page coordinates when no window measurement exists", () => {
    const metrics = resolveDragStartMetrics({
      locationX: 18,
      locationY: 9,
      pageX: 162,
      pageY: 327,
    });

    expect(metrics).toEqual({
      itemWindowX: 144,
      itemWindowY: 318,
      pointerWindowX: 162,
      pointerWindowY: 327,
    });
  });
});
