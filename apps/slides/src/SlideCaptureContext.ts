import { createContext } from "react";

// Native snapshots depend on the stage's physical scale, not just Yoga layout.
// Zero means the stage is unmeasured, hidden, or still transitioning.
export const SlideCaptureContext = createContext(0);
