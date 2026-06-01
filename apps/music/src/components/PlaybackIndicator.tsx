import { View } from "react-native";

export function PlaybackIndicator() {
    return (
        <View
            pointerEvents="none"
            className="absolute left-0 top-0 bottom-0 w-1 bg-accent-primary rounded-tr-sm rounded-br-sm"
        />
    );
}
