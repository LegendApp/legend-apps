import { Text, View } from "react-native";
import { SceneMotionView, usePresentationValue } from "@legend-apps/presentation";
import benchmarks from "./rnconnection-assets/benchmarks.json";

const groups = [
  { title: "Native platform", names: ["AppKit", "SwiftUI"], color: "#a5b4fc" },
  { title: "Runtime / engine included", names: ["GPUI", "React Native", "Tauri", "Flutter", "Deno WebView"], color: "#67e8f9" },
  { title: "Bundled browser", names: ["Electron", "Deno CEF"], color: "#c4b5fd" },
];
const rows = [...benchmarks.hello].sort((a, b) => a.size - b.size);
const groupedRowSpacing = 47;
const groupSpacing = 112;
const groupStarts = groups.map((_, index) => 55 + groups.slice(0, index).reduce(
  (offset, group) => offset + rows.filter((row) => group.names.includes(row.name)).length * groupedRowSpacing + groupSpacing, 0,
));
const focusOrder = [0, 2, 1];
const chartWidth = 1696;
const chartHeight = 710;
const barSpace = 1210;
const fullMaximum = 320;

/** Focus changes only vertical composition; every bar keeps its original length. */
export function HelloSizeJourney() {
  const step = usePresentationValue("stepIndex");
  const scene = Math.max(0, Math.min(4, step));
  const focus = scene >= 2 ? focusOrder[scene - 2] : -1;
  const grouped = scene !== 0;

  return <View style={{ width: chartWidth, height: chartHeight, marginTop: 24, alignSelf: "center", overflow: "hidden" }}>
    {groups.map((group, groupIndex) => {
      const members = rows.filter((row) => group.names.includes(row.name));
      const focused = focus === groupIndex;
      const hidden = focus >= 0 && !focused;
      // Focused sections form one continuous vertical strip. Clipping, rather than
      // opacity, hides neighboring groups so the camera passes through them.
      const focusedStart = (chartHeight - (members.length * 68 + 48)) / 2 + 48;
      const groupY = focus < 0 ? groupStarts[groupIndex]
        : focusedStart + (groupIndex - focus) * chartHeight;
      return <SceneMotionView key={group.title} hidden={hidden} duration={scene === 3 ? 1100 : 650}
        pose={{ y: groupY }}
        style={{ position: "absolute", left: 0, top: 0, width: chartWidth }}>
        <SceneMotionView hidden={!grouped} pose={{ y: -50, opacity: grouped ? 1 : 0 }}
          style={{ position: "absolute", left: 0, top: 0 }}>
          <Text style={{ fontSize: 36, lineHeight: 44, color: group.color, fontWeight: "500" }}>{group.title}</Text>
        </SceneMotionView>
        {members.map(({ name, size }, index) => {
          const y = grouped ? index * (focus >= 0 ? 68 : groupedRowSpacing)
            : 55 + rows.findIndex((row) => row.name === name) * 57 - groupStarts[groupIndex];
          return <SceneMotionView key={name} pose={{ y }}
            style={{ position: "absolute", left: 0, top: 0, width: chartWidth, height: 43, justifyContent: "center" }}>
            <Text style={{ position: "absolute", left: 0, fontSize: 34, lineHeight: 42, color: name === "React Native" ? "#ffffff" : "#d4d4d4", fontWeight: name === "React Native" ? "600" : "400" }}>{name}</Text>
            <View style={{ position: "absolute", left: 285, width: Math.max(2, size / fullMaximum * barSpace), height: 30, backgroundColor: group.color }} />
            <Text style={{ position: "absolute", right: 0, width: 190, fontSize: 34, lineHeight: 42, textAlign: "right", color: "#e5e5e5", fontVariant: ["tabular-nums"] }}>{size.toFixed(1)} MiB</Text>
          </SceneMotionView>;
        })}
      </SceneMotionView>;
    })}
  </View>;
}
