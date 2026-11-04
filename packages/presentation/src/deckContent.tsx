import { createContext, useContext, type ReactNode } from "react";

/** Declarative children of every slide, in source order. Reading does not mount them. */
export const DeckContentContext = createContext<readonly ReactNode[]>([]);

/** Lets retained scenes prepare parts from later slides before navigation. */
export function useDeckContent(): readonly ReactNode[] {
  return useContext(DeckContentContext);
}
