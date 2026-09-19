import type { ReactNode } from "react";
import { View } from "react-native";

/** Inexpensive native styling, not a backdrop capture or refractive glass effect. */
export function SlideSurface({ preset, children }: { preset: "translucent" | "glow"; children?: ReactNode }) {
  const glow = preset === "glow";
  return <View style={{ padding: 24, borderRadius: 20, borderWidth: 1,
    backgroundColor: glow ? "rgba(20,58,76,0.38)" : "rgba(160,190,210,0.12)",
    borderColor: glow ? "rgba(139,229,255,0.65)" : "rgba(255,255,255,0.45)",
    ...(glow ? { shadowColor: "#67e8f9", shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } } : {}),
  }}>{children}</View>;
}
