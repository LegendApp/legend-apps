import { createContext } from "react";

// Native snapshots depend on the stage's physical scale, not just Yoga layout.
// Zero means capture is disabled or the stage is unmeasured. Prepared audience
// slides retain their full physical scale behind the visible slide.
export const SlideCaptureContext = createContext(0);

/** Asks a background render graph below it for one encoded frame per request id. */
export type SurfaceStillRequest = { id?: string; announce(): void; deliver(id: string, uri: string): void };
export const SurfaceStillContext = createContext<SurfaceStillRequest | null>(null);
