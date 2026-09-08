import { createContext } from "react";

// Native snapshots depend on the stage's physical scale, not just Yoga layout.
// Zero means capture is disabled or the stage is unmeasured. Prepared audience
// slides retain their full physical scale behind the visible slide.
export const SlideCaptureContext = createContext(0);
