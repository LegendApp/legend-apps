import { GlassEffectView, type GlassEffectStyle } from "@legend-apps/glass-effect-view";
import type { ReactNode } from "react";
import type { ColorValue, ViewProps } from "react-native";

export interface EffectViewProps extends ViewProps {
    children?: ReactNode;
    glassStyle?: GlassEffectStyle;
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
        <GlassEffectView glassStyle={glassStyle} tintColor={tintColor} {...props}>
            {children}
        </GlassEffectView>
    );
}
