import { createContext } from "react";
import type { SharedValue } from "react-native-reanimated";
export const RecordingPositionContext = createContext<SharedValue<number> | undefined>(undefined);
