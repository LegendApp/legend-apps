import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import ScaledViewNativeComponent from "./ScaledViewNativeComponent";

export interface ScaledViewProps extends ViewProps {
  children?: ReactNode;
  contentHeight: number;
  contentWidth: number;
}

export function ScaledView({ children, contentHeight, contentWidth, ...props }: ScaledViewProps) {
  return (
    <ScaledViewNativeComponent contentHeight={contentHeight} contentWidth={contentWidth} {...props}>
      <View collapsable={false} style={{ height: contentHeight, width: contentWidth }}>
        {children}
      </View>
    </ScaledViewNativeComponent>
  );
}
