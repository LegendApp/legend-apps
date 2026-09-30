import { GlassView, type GlassStyle } from "@legendapp/spark/ui/glass";
import type { ReactNode } from "react";
import type { ColorValue, ViewProps } from "react-native";

export interface EffectViewProps extends ViewProps {
    children?: ReactNode;
    glassStyle?: GlassStyle;
    tintColor?: ColorValue;
    blendingMode?: string;
    material?: string;
    state?: string;
}

export function EffectView({
    children,
    glassStyle = "regular",
    tintColor = "#00000033",
    blendingMode: _blendingMode,
    material: _material,
    state: _state,
    ...props
}: EffectViewProps) {
    return (
        <GlassView glassStyle={glassStyle} tintColor={tintColor} {...props}>
            {children}
        </GlassView>
    );
}
