import { useContext, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { SceneMotionView } from "./SceneMotionView";
import { FocusLayoutOffsetContext } from "./focus";

/** Move only the transform; expose destination geometry to shared measurement. */
export function ScenePositionView({ y, children, style, duration = 650 }: {
  y: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const ancestorOffset = useContext(FocusLayoutOffsetContext);
  // Keep native layout fixed; shared-element measurement uses the destination.
  return <SceneMotionView pose={{ y }} duration={duration} style={[style, { position: "absolute", top: 0 }]}>
    <FocusLayoutOffsetContext.Provider value={ancestorOffset + y}>{children}</FocusLayoutOffsetContext.Provider>
  </SceneMotionView>;
}
