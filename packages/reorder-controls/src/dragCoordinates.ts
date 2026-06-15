import type { LayoutRectangle } from "react-native";

type DragStartEventCoordinates = {
    locationX?: number;
    locationY?: number;
    pageX?: number;
    pageY?: number;
};

type WindowMeasurement = LayoutRectangle;

export type DragStartMetrics = {
    itemWindowX: number;
    itemWindowY: number;
    pointerWindowX: number;
    pointerWindowY: number;
};

function finiteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function resolveDragStartMetrics(
    event: DragStartEventCoordinates,
    measurement?: WindowMeasurement | null,
): DragStartMetrics {
    const locationX = finiteNumber(event.locationX) ? event.locationX : 0;
    const locationY = finiteNumber(event.locationY) ? event.locationY : 0;

    if (measurement) {
        return {
            itemWindowX: measurement.x,
            itemWindowY: measurement.y,
            pointerWindowX: measurement.x + locationX,
            pointerWindowY: measurement.y + locationY,
        };
    }

    const pointerWindowX = finiteNumber(event.pageX) ? event.pageX : locationX;
    const pointerWindowY = finiteNumber(event.pageY) ? event.pageY : locationY;

    return {
        itemWindowX: pointerWindowX - locationX,
        itemWindowY: pointerWindowY - locationY,
        pointerWindowX,
        pointerWindowY,
    };
}
