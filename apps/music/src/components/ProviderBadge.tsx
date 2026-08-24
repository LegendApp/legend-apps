import { Text, View } from "react-native";
import { cn } from "@legend-apps/classnames";

export function ProviderBadge({ provider, compact = false }: { provider?: string; compact?: boolean }) {
    if (provider !== "spotify" && provider !== "appleMusic") return null;
    const label = provider === "spotify" ? "Spotify" : "Apple Music";
    return (
        <View
            accessibilityLabel={`Source: ${label}`}
            className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5",
                provider === "spotify"
                    ? "border-emerald-400/40 bg-emerald-500/15"
                    : "border-pink-400/40 bg-pink-500/15",
            )}
        >
            <Text className={cn("font-semibold", compact ? "text-[9px]" : "text-[10px]", provider === "spotify" ? "text-emerald-300" : "text-pink-300")}>{compact ? (provider === "spotify" ? "S" : "A") : label}</Text>
        </View>
    );
}
