import { createContext, useContext } from "react";

export type StoryAppearance = { accentColor?: string; titleSize?: number };
const StoryAppearanceContext = createContext<StoryAppearance>({});
export const StoryAppearanceProvider = StoryAppearanceContext.Provider;
export function useStoryAppearance() { return useContext(StoryAppearanceContext); }
