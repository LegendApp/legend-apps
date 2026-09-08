import { Background, type PresentationTemplateProps } from "@legend-apps/presentation";
import { Children, isValidElement } from "react";
import { Text, View } from "react-native";
import { Scene } from "./Scene";
import { AmbientAurora } from "./packs/backgrounds";

export default function TalkTemplate({ children, slide }: PresentationTemplateProps) {
  const customScene = Children.toArray(children).some((child) => isValidElement(child) && child.type === Scene);
  return (
    <>
      <Background priority={-1}><AmbientAurora /></Background>
      <View style={{ flex: 1, paddingHorizontal: 120, paddingVertical: 80 }}>
        {customScene ? children : (
          <>
            {typeof slide.eyebrow === "string" && <Text className="mb-5 text-2xl font-semibold uppercase tracking-widest text-cyan-300">{slide.eyebrow}</Text>}
            <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>
            <View className="mt-6 flex-row items-center justify-between border-t border-slate-700 pt-5">
              <Text className="text-xl text-slate-400">{typeof slide.footer === "string" ? slide.footer : "REACT NATIVE / DESKTOP"}</Text>
              <View className="h-1 w-16 bg-cyan-300" />
            </View>
          </>
        )}
      </View>
    </>
  );
}
