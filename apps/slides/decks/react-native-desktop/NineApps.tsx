import { FocusRegion, SharedElement, usePresentationValue, type PresentationTemplateProps } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { appCardLayout, appOrder, filmstripPosition, type AppId, type SceneMode } from "./NineAppsGeometry";

const names: Record<AppId, string> = {
  "react-native": "React Native", appkit: "AppKit", swiftui: "SwiftUI", electron: "Electron",
  tauri: "Tauri", "deno-webview": "Deno WebView", "deno-cef": "Deno CEF", flutter: "Flutter", gpui: "GPUI",
};
// Add deck-local image imports here when the final captures arrive.
// The RN still should match the video's last frame for a seamless handoff.
const screenshots: Partial<Record<AppId, string>> = {};

function useFilmstripClock(enabled: boolean) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const startedAt = usePresentationValue("startedAt");
  const step = usePresentationValue("stepIndex");
  const stepStartedAt = usePresentationValue("stepStartedAt");
  const [clock, setClock] = useState({ epoch: startedAt, elapsed: 0 });
  useEffect(() => {
    if (!enabled || !active || preview || preparing || step > 0 || startedAt === undefined) return;
    let frame = 0;
    const tick = () => {
      setClock({ epoch: startedAt, elapsed: Math.max(0, performance.now() - startedAt) });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, active, preview, preparing, step, startedAt]);
  if (preview || preparing || startedAt === undefined) return 0;
  if (step > 0) return Math.max(0, (stepStartedAt ?? startedAt) - startedAt);
  return clock.epoch === startedAt ? clock.elapsed : 0;
}

// Full-stage template avoids the standard Markdown content padding.
export default function NineAppsFrame({ children }: PresentationTemplateProps) {
  return <View style={{ flex: 1 }}>{children}</View>;
}

export function NineApps({ mode }: { mode: SceneMode }) {
  const elapsed = useFilmstripClock(mode === "filmstrip");
  const step = usePresentationValue("stepIndex");
  const position = filmstripPosition(elapsed);
  const title = mode === "hero" ? "I built a chat history app." : mode === "grid" ? "Then I built it nine times." : "Same app. Nine implementations.";
  return <FocusRegion id="nine-apps-stage" style={{ width: 1920, height: 1080, backgroundColor: "#091321", overflow: "hidden" }}>
    <Text style={{ position: "absolute", left: 112, top: 65, color: "#f8fafc", fontSize: 64, fontWeight: "700" }}>{title}</Text>
    {appOrder.map((id, index) => {
      const card = appCardLayout(index, mode, position);
      const height = card.width * 0.625;
      const captionHeight = card.width * 0.0625;
      const uri = screenshots[id];
      return <SharedElement key={id} id={`nine-app-${id}`} style={{ position: "absolute", left: card.x - card.width / 2,
        top: card.y - height / 2, width: card.width, height, zIndex: card.depth }}>
        <View style={{ flex: 1, opacity: card.opacity, borderRadius: 12, overflow: "hidden", borderWidth: 2,
          borderColor: id === "react-native" ? "#67e8f9" : "#33465e", backgroundColor: "#101e30" }}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#14253a" }}>
            {uri ? <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", height: "100%" }} /> : <>
              <View style={{ width: "78%", height: "64%", borderWidth: 1, borderColor: "#36516d", borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#a9bdd2", fontSize: Math.max(18, card.width * 0.034), fontWeight: "600" }}>{mode === "hero" && id === "react-native" ? "REACT NATIVE VIDEO" : names[id]}</Text>
                <Text style={{ color: "#718ba6", fontSize: Math.max(13, card.width * 0.018), marginTop: 10 }}>Media placeholder</Text>
              </View>
            </>}
          </View>
          <View style={{ height: captionHeight, minHeight: 24, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: Math.max(17, card.width * 0.027), fontWeight: "600", color: id === "react-native" ? "#67e8f9" : "#e2e8f0" }}>{names[id]}</Text>
          </View>
        </View>
      </SharedElement>;
    })}
    <Text style={{ position: "absolute", left: 112, bottom: 58, fontSize: 25, color: "#94a3b8" }}>
      {mode === "hero" ? "Open → scroll → switch conversations" : mode === "grid" ? "Same conversation. Same features. Different frameworks." : "Same conversation. Same features. Nine ways to build it."}
    </Text>
    {mode === "filmstrip" && <Text style={{ position: "absolute", right: 112, bottom: 58, fontSize: 22, color: "#67e8f9" }}>{step > 0 ? "Paused · advance to continue the talk" : "Advance to pause"}</Text>}
  </FocusRegion>;
}
