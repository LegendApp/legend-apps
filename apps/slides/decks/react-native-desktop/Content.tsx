import { Text, View } from "react-native";

export function Columns({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <View className="flex-row gap-12">
      {items.map(([title, detail], index) => (
        <View className="flex-1 gap-8 border-t-2 border-cyan-300 pt-8" key={title}>
          <Text className="text-2xl text-cyan-300">{String(index + 1).padStart(2, "0")}</Text>
          <Text className="text-5xl font-semibold text-white">{title}</Text>
          <Text className="text-3xl leading-relaxed text-slate-300">{detail}</Text>
        </View>
      ))}
    </View>
  );
}

export function Rows({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <View className="gap-8">
      {items.map(([title, detail]) => (
        <View className="flex-row gap-10 border-b border-slate-800 pb-8" key={title}>
          <Text className="text-4xl font-semibold text-cyan-200" style={{ width: 440 }}>{title}</Text>
          <Text className="flex-1 text-3xl leading-relaxed text-slate-200">{detail}</Text>
        </View>
      ))}
    </View>
  );
}

export function CodePanel({ code, label, detail }: { code: string; label: string; detail?: string }) {
  return (
    <View className="gap-8">
      <Text className="text-2xl text-slate-400">{label}</Text>
      <View className="rounded-2xl border border-slate-700 bg-slate-900 p-10">
        <Text style={{ fontFamily: "Menlo", fontSize: 30, lineHeight: 44, color: "#cffafe" }}>{code}</Text>
      </View>
      {detail ? <Text className="text-3xl leading-relaxed text-slate-300">{detail}</Text> : null}
    </View>
  );
}

// A design comparison, deliberately not attributed to framework screenshots.
export function SidebarGallery() {
  return (
    <View className="gap-8">
      <View className="flex-row gap-10">
        {["A rectangle", "A darker rectangle", "A rectangle with ambition"].map((title, index) => (
          <View className="flex-1 gap-6" key={title}>
            <Text className="text-3xl text-slate-200">{title}</Text>
            <View className="h-96 flex-row overflow-hidden rounded-2xl border border-slate-600 bg-slate-950">
              <View className="gap-6 p-6" style={{ width: "58%", backgroundColor: ["#334155", "#172033", "#283b50"][index] }}>
                <Text className="text-2xl font-semibold text-white">Conversations</Text>
                {[0, 1, 2, 3, 4].map(row => <View key={row} className="h-5 rounded" style={{ width: row % 2 ? "70%" : "90%", backgroundColor: row === 1 ? "#67e8f9" : "#526580" }} />)}
              </View>
              <View className="flex-1 gap-6 p-5">
                {[0, 1, 2].map(row => <View key={row} className="h-12 rounded-lg bg-slate-800" />)}
              </View>
            </View>
          </View>
        ))}
      </View>
      <Text className="text-3xl text-slate-400">Fine for navigation. I would also like some personality.</Text>
    </View>
  );
}

export function NativeLayers() {
  return (
    <View className="gap-6">
      {[
        ["React", "Components, state, events, composition"],
        ["Native UI", "AppKit split view + React Native content"],
        ["Platform services", "Windows, menus, files, appearance"],
      ].map(([title, detail], index) => (
        <View className="flex-row items-center gap-10 rounded-xl border border-slate-600 p-8" style={{ marginLeft: index * 64, backgroundColor: ["#164e63", "#172b43", "#111c30"][index] }} key={title}>
          <Text className="text-4xl font-semibold text-cyan-100" style={{ width: 390 }}>{title}</Text>
          <Text className="flex-1 text-3xl text-slate-200">{detail}</Text>
        </View>
      ))}
      <Text className="mt-6 text-3xl text-slate-400">Native containers and custom content can live in the same component tree.</Text>
    </View>
  );
}
