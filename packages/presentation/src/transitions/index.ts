import type { ViewStyle } from "react-native";

export type TransitionContext = {
  progress: number;
  direction: "forward" | "backward";
  width: number;
  height: number;
  options: Record<string, unknown>;
  hasBackground: boolean;
};
export type TransitionDefinition = {
  duration?: number;
  easing?: "linear" | "ease-out-cubic" | "ease-in-out";
  /** Independent shared elements take precedence over slide transforms. */
  sharedElements?: "independent" | "slide";
  styles(context: TransitionContext): { incoming: ViewStyle; outgoing: ViewStyle };
};
export type PresentationTransitions = Record<string, TransitionDefinition>;
export function defineTransition(definition: TransitionDefinition): TransitionDefinition {
  if (!definition || typeof definition.styles !== "function") throw new Error("A transition must export a styles function.");
  if (definition.duration !== undefined && (!Number.isFinite(definition.duration) || definition.duration < 0 || definition.duration > 10000)) throw new Error("Transition duration must be between 0 and 10000 ms.");
  if (definition.easing && !["linear", "ease-out-cubic", "ease-in-out"].includes(definition.easing)) throw new Error("Unknown transition easing.");
  if (definition.sharedElements && !["independent", "slide"].includes(definition.sharedElements)) throw new Error("sharedElements must be independent or slide.");
  return definition;
}

/** Sources are also installed as editable files in the user's transition library. */
export const builtinTransitionSources: Record<string, string> = {
  "fade": `import { defineTransition } from "@legend-apps/presentation";
export default defineTransition({
  duration: 320,
  easing: "ease-out-cubic",
  styles({ progress, hasBackground }) {
    return { incoming: { opacity: progress }, outgoing: { opacity: hasBackground ? 1 - progress : 1 } };
  },
});
`,
  "reveal-up": `import { defineTransition } from "@legend-apps/presentation";
export default defineTransition({
  duration: 650,
  easing: "ease-out-cubic",
  styles({ progress, options, hasBackground }) {
    const distance = typeof options.distance === "number" ? options.distance : 20;
    return {
      incoming: { opacity: progress, transform: [{ translateY: (1 - progress) * distance }] },
      outgoing: { opacity: hasBackground ? 1 - progress : 1 },
    };
  },
});
`,
  "slide": `import { defineTransition } from "@legend-apps/presentation";
export default defineTransition({
  duration: 320,
  easing: "ease-out-cubic",
  styles({ progress }) {
    return {
      incoming: { opacity: progress, transform: [{ translateX: (1 - progress) * 180 }] },
      outgoing: { opacity: 1 - progress, transform: [{ translateX: -progress * 90 }] },
    };
  },
});
`,
};
