import { state$ } from "./State";

export const startNavMeasurement = () => {
    state$.lastNavStart.set(Date.now());
};
