import { useEffect, useState } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";
import { usePresentationValue } from "@legend-apps/presentation";

const white = "#f5f5f5";
const muted = "#a3a3a3";
const line = "#525252";
const accent = "#67e8f9";

export function MediaSlot({ label, kind = "video", height = 490 }: { label: string; kind?: "video" | "screenshot"; height?: number }) {
  return (
    <View accessibilityLabel={`${kind} placeholder: ${label}`} style={{ height, borderWidth: 2, borderStyle: "dashed", borderColor: line, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 24, backgroundColor: "#080808" }}>
      <Text style={{ color: muted, fontSize: 44 }}>{kind === "video" ? "▷" : "▧"}</Text>
      <Text style={{ color: white, fontSize: height < 250 ? 24 : 36, textAlign: "center", paddingHorizontal: 20 }}>{label}</Text>
      <Text style={{ color: muted, fontSize: 20 }}>{kind === "video" ? "VIDEO PLACEHOLDER" : "SCREENSHOT PLACEHOLDER"}</Text>
    </View>
  );
}

export function AppMontage() {
  return <View style={{ flexDirection: "row", gap: 24, marginTop: 32 }}>
    {["Music", "Code", "Diff"].map((label) => <View key={label} style={{ flex: 1 }}><MediaSlot label={label} height={400} /></View>)}
  </View>;
}

export function ComparisonWall({ image }: { image: string }) {
  const names = ["React Native", "AppKit", "SwiftUI", "Electron", "Tauri", "Deno WebView", "Deno CEF", "Flutter", "GPUI"];
  return <View style={{ gap: 16, marginTop: 12 }}>
    {[0, 1, 2].map((row) => <View key={row} style={{ flexDirection: "row", gap: 20 }}>
      {names.slice(row * 3, row * 3 + 3).map((name) => <View key={name} style={{ flex: 1, gap: 8 }}>
        {name === "React Native"
          ? <Image source={{ uri: image }} resizeMode="contain" style={{ width: "100%", height: 150 }} />
          : <View style={{ height: 150, borderWidth: 1, borderStyle: "dashed", borderColor: line, justifyContent: "center", alignItems: "center" }}><Text style={{ color: muted, fontSize: 18 }}>Screenshot placeholder</Text></View>}
        <Text style={{ color: white, textAlign: "center", fontSize: 24 }}>{name}</Text>
      </View>)}
    </View>)}
  </View>;
}

/** Deliberately schematic window, not a simulated product screenshot. */
export function WindowGlyph({ variant = "app", width = 260, height = 180 }: { variant?: "app" | "code" | "rows"; width?: number; height?: number }) {
  return <View style={{ width, height, borderWidth: 2, borderColor: line, borderRadius: 12, overflow: "hidden" }}>
    <View style={{ height: 26, borderBottomWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 }}>
      {[0, 1, 2].map((i) => <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: muted }} />)}
    </View>
    <View style={{ flex: 1, flexDirection: "row", padding: 14, gap: 12 }}>
      {variant === "app" && <View style={{ width: "24%", backgroundColor: "#202020", borderRadius: 3 }} />}
      <View style={{ flex: 1, gap: 10, justifyContent: "center" }}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={{ height: variant === "rows" ? 16 : 5, width: `${i % 2 ? 68 : 95}%`, backgroundColor: i === 1 ? accent : "#404040", borderRadius: 2 }} />)}
      </View>
    </View>
  </View>;
}

export function FlowGlyph({ label }: { label: string }) {
  const document = /document|rows/i.test(label);
  const react = /React|Markdown/i.test(label);
  return <View style={{ height: 190, alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
    {document ? <View style={{ width: 140, height: 172, borderWidth: 2, borderColor: line, borderRadius: 8, padding: 18, gap: 12 }}>
      {Array.from({ length: 7 }, (_, i) => <View key={i} style={{ height: 7, backgroundColor: /rows/i.test(label) && i > 1 && i < 5 ? accent : "#404040" }} />)}
    </View> : react ? <Text style={{ color: white, fontSize: 84, fontWeight: "300" }}>{"{ }"}</Text> : <WindowGlyph variant={/runtime|build/i.test(label) ? "code" : "app"} />}
  </View>;
}

export function NativeDataDiagram() {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 56, marginTop: 48 }}>
    <View style={{ alignItems: "center", gap: 24 }}>
      <View style={{ width: 350, height: 350, borderWidth: 2, borderColor: line, padding: 24, gap: 9 }}>
        {Array.from({ length: 18 }, (_, i) => <View key={i} style={{ height: 8, backgroundColor: i >= 7 && i <= 10 ? accent : "#303030", width: `${i % 3 === 0 ? 75 : 100}%` }} />)}
      </View>
      <Text style={{ color: white, fontSize: 32 }}>Native document</Text>
    </View>
    <View style={{ alignItems: "center", gap: 16 }}><Text style={{ color: muted, fontSize: 26 }}>Visible rows only</Text><Text style={{ color: accent, fontSize: 72 }}>→</Text></View>
    <View style={{ alignItems: "center", gap: 24 }}><WindowGlyph variant="rows" width={420} height={350} /><Text style={{ color: white, fontSize: 32 }}>React view</Text></View>
  </View>;
}

export function PlatformDiagram({ scope = false }: { scope?: boolean }) {
  return <View style={{ alignItems: "center", marginTop: 20 }}>
    <Text style={{ color: white, fontSize: 38 }}>{scope ? "Legend Framework" : "Shared React logic"}</Text>
    <View style={{ width: 2, height: 45, backgroundColor: line }} />
    <View style={{ width: 1050, height: 2, backgroundColor: line }} />
    <View style={{ flexDirection: "row", gap: 70 }}>
      {(scope ? ["macOS", "Windows", "Mobile + web"] : ["Mobile", "Desktop", "Web"]).map((label, index) => <View key={label} style={{ width: 420, alignItems: "center", gap: 20 }}>
        <View style={{ width: 2, height: 35, backgroundColor: line }} />
        <View style={{ height: 210, justifyContent: "center" }}>
          {index === 0 && !scope ? <View style={{ width: 100, height: 195, borderRadius: 20, borderWidth: 2, borderColor: line, padding: 12, gap: 14 }}>
            <View style={{ width: 30, height: 4, alignSelf: "center", backgroundColor: muted }} /><View style={{ height: 110, backgroundColor: "#171717" }} />
          </View> : <WindowGlyph width={300} height={190} />}
        </View>
        <Text style={{ color: white, fontSize: 36 }}>{label}</Text>
        {scope && <Text style={{ color: muted, fontSize: 24 }}>{["First", "Verification pending", "Via Expo"][index]}</Text>}
      </View>)}
    </View>
  </View>;
}

export function CapabilityDiagram() {
  const top = ["Windows", "Menus", "Shortcuts"];
  const bottom = ["Files", "Storage", "OS services"];
  return <View style={{ alignItems: "center", gap: 0, marginTop: 24 }}>
    <View style={{ flexDirection: "row", gap: 80 }}>
      {top.map((label) => <View key={label} style={{ width: 300, alignItems: "center", gap: 12 }}><Text style={{ color: white, fontSize: 32 }}>{label}</Text><View style={{ width: 2, height: 45, backgroundColor: line }} /></View>)}
    </View>
    <View style={{ width: 1060, borderTopWidth: 2, borderBottomWidth: 2, borderColor: line, alignItems: "center", paddingVertical: 24 }}>
      <WindowGlyph width={360} height={190} /><Text style={{ color: accent, fontSize: 28, marginTop: 18 }}>React Native app</Text>
    </View>
    <View style={{ flexDirection: "row", gap: 80 }}>
      {bottom.map((label) => <View key={label} style={{ width: 300, alignItems: "center", gap: 12 }}><View style={{ width: 2, height: 45, backgroundColor: line }} /><Text style={{ color: white, fontSize: 32 }}>{label}</Text></View>)}
    </View>
  </View>;
}

const balanceCircles = [
  { x: 250, y: 0, stroke: "rgba(103,232,249,0.65)", fill: "rgba(103,232,249,0.065)" },
  { x: 125, y: 145, stroke: "rgba(147,197,253,0.55)", fill: "rgba(96,165,250,0.075)" },
  { x: 375, y: 145, stroke: "rgba(196,181,253,0.55)", fill: "rgba(167,139,250,0.075)" },
];

export function BalanceDiagram() {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const startedAt = usePresentationValue("startedAt");
  const [progress] = useState(() => new Animated.Value(preview || !active ? 1 : 0));

  useEffect(() => {
    progress.setValue(preview || !active ? 1 : 0);
    if (active && !preview) {
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: 650,
        easing: Easing.linear,
        useNativeDriver: false,
        isInteraction: false,
      });
      animation.start();
      return () => animation.stop();
    }
  }, [active, preview, startedAt, progress]);

  const centerOpacity = progress.interpolate({ inputRange: [0, 0.4, 0.85, 1], outputRange: [0, 0, 1, 1] });
  return <View accessibilityLabel="React Native at the intersection of speed, low memory, and native UI" style={{ alignSelf: "center", width: 1000, height: 650, marginTop: 24 }}>
    {balanceCircles.map(({ x, y, stroke, fill }, index) => {
      const start = index * 0.1;
      const opacity = progress.interpolate({ inputRange: [start, start + 0.5], outputRange: [0, 1], extrapolate: "clamp" });
      const scale = progress.interpolate({ inputRange: [start, start + 0.25, start + 0.65], outputRange: [0.92, 0.98, 1], extrapolate: "clamp" });
      return <Animated.View key={index} style={{ position: "absolute", left: x, top: y, width: 500, height: 500, borderRadius: 250, borderWidth: 1.5, borderColor: stroke, backgroundColor: fill, opacity, transform: [{ scale }] }} />;
    })}
    <Text style={{ position: "absolute", top: 100, left: 350, width: 300, textAlign: "center", color: "#cffafe", fontSize: 36, fontWeight: "500", letterSpacing: -0.5 }}>Speed</Text>
    <Text style={{ position: "absolute", top: 424, left: 150, width: 280, textAlign: "center", color: "#dbeafe", fontSize: 36, fontWeight: "500", letterSpacing: -0.5 }}>Low memory</Text>
    <Text style={{ position: "absolute", top: 424, left: 570, width: 280, textAlign: "center", color: "#ede9fe", fontSize: 36, fontWeight: "500", letterSpacing: -0.5 }}>Native UI</Text>
    <Animated.View style={{ position: "absolute", left: 390, top: 305, width: 220, alignItems: "center", opacity: centerOpacity }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent, marginBottom: 18 }} />
      <Text style={{ color: white, fontSize: 38, lineHeight: 44, fontWeight: "600", textAlign: "center", letterSpacing: -1 }}>{"React\nNative"}</Text>
    </Animated.View>
  </View>;
}

export function MeasurementDiagram() {
  return <View style={{ alignItems: "center", gap: 40, marginTop: 24 }}>
    <View style={{ flexDirection: "row", gap: 60, alignItems: "center" }}>
      <View style={{ gap: 24, alignItems: "center" }}><View style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: white, fontSize: 36 }}>↵</Text></View><Text style={{ color: white, fontSize: 30 }}>Launch / action</Text></View>
      <View style={{ width: 360, height: 2, backgroundColor: accent }} />
      <View style={{ gap: 24, alignItems: "center" }}><WindowGlyph /><Text style={{ color: white, fontSize: 30 }}>Visible result</Text></View>
    </View>
    <View style={{ flexDirection: "row", gap: 16 }}>{Array.from({ length: 10 }, (_, i) => <View key={i} style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: line, justifyContent: "center", alignItems: "center" }}><Text style={{ color: muted, fontSize: 20 }}>{i + 1}</Text></View>)}</View>
    <Text style={{ color: muted, fontSize: 28 }}>10 rounds → median</Text>
  </View>;
}

export function RenderingDiagram() {
  return <View style={{ flexDirection: "row", justifyContent: "center", gap: 72, marginTop: 32 }}>
    {["Native", "Web", "Canvas"].map((label, index) => <View key={label} style={{ width: 420, alignItems: "center", gap: 28 }}>
      <View style={{ width: 360, height: 260, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: line, borderRadius: 12 }}>
        {index === 0 ? <View style={{ gap: 14 }}><View style={{ width: 240, height: 44, borderWidth: 1, borderColor: muted, borderRadius: 8 }} /><View style={{ width: 130, height: 44, borderWidth: 1, borderColor: accent, borderRadius: 8 }} /></View>
          : index === 1 ? <Text style={{ color: white, fontSize: 54 }}>{"<div />"}</Text>
          : <View style={{ flexDirection: "row", gap: 24 }}><View style={{ width: 90, height: 90, borderRadius: 45, borderColor: accent, borderWidth: 2 }} /><View style={{ width: 80, height: 80, borderColor: muted, borderWidth: 2, transform: [{ rotate: "20deg" }] }} /></View>}
      </View>
      <Text style={{ color: white, fontSize: 36 }}>{label}</Text>
    </View>)}
  </View>;
}
