import { SFSymbol } from "@legend-apps/sf-symbol";
import type { SFSymbols } from "../types/SFSymbols";

interface IconProps {
    name: SFSymbols;
    size: number;
    color?: string;
    yOffset?: number;
}

export function Icon({ name, size, color: colorProp, yOffset }: IconProps) {
    const color = colorProp ?? "white";

    return <SFSymbol name={name} size={size} color={color} yOffset={yOffset} />;
}
