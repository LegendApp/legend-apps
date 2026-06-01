import { state$ } from "@/systems/State";

export const startNavMeasurement = () => {
    state$.lastNavStart.set(Date.now());
};
