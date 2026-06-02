import { ActivityIndicator } from "react-native";

type SkiaSpinnerProps = {
    size?: number;
    color?: string;
    className?: string;
};

export function SkiaSpinner({ size = 32, color = "#5ac8fa", className }: SkiaSpinnerProps) {
    return <ActivityIndicator className={className} color={color} style={{ width: size, height: size }} />;
}
