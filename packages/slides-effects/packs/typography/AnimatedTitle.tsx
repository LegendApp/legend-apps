import { useMemo, useState } from "react";
import { Text, View, type TextStyle } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { samplePlayback, usePlayback, usePresentationValue } from "@legend-apps/presentation";
import { sampleTitleEntrance, titleEntranceDuration, titleEntranceEffects, type TitleEntranceEffect } from "./TitleEntrances";

type Slot = { text: string; index: number; count: number; lineIndex: number; lineCount: number };
type MotionProps = { effect: TitleEntranceEffect; time: SharedValue<number> };

function TitleSlot({ text, index, count, lineIndex, lineCount, effect, time, textStyle }: Slot & MotionProps & { textStyle: TextStyle }) {
  const motion = useAnimatedStyle(() => {
    "worklet";
    const frame = sampleTitleEntrance(effect, time.value, index, count, lineIndex, lineCount);
    return {
      opacity: frame.opacity,
      transform: [{ perspective: 1000 }, { translateX: frame.x }, { translateY: frame.y },
        { rotate: `${frame.rotate}deg` }, { rotateX: `${frame.rotateX}deg` },
        { scaleX: frame.scaleX }, { scaleY: frame.scaleY }],
    };
  }, [effect, index, count, lineIndex, lineCount, time]);
  const title = <Animated.View style={motion}><Text accessible={false} style={textStyle}>{text}</Text></Animated.View>;
  return effect === "word-lift" ? <View style={{ overflow: "hidden" }}>{title}</View> : title;
}

function MaskedTitle({ children, width, textStyle, effect, time }: MotionProps & {
  children: string; width: number; textStyle: TextStyle;
}) {
  const [height, setHeight] = useState(Number(textStyle.lineHeight) * children.split("\n").length);
  const mask = useAnimatedStyle(() => {
    "worklet";
    const frame = sampleTitleEntrance(effect, time.value);
    return { width: width * frame.reveal, left: effect === "curtain" ? width * (1 - frame.reveal) / 2 : 0, opacity: frame.opacity };
  }, [effect, width, time]);
  const offset = useAnimatedStyle(() => {
    "worklet";
    const frame = sampleTitleEntrance(effect, time.value);
    return { transform: [{ translateX: effect === "curtain" ? -width * (1 - frame.reveal) / 2 : 0 }] };
  }, [effect, width, time]);
  return <View style={{ width, height }}>
    <Text accessible={false} onLayout={event => setHeight(event.nativeEvent.layout.height)}
      style={[textStyle, { width, opacity: 0 }]}>{children}</Text>
    <Animated.View style={[{ position: "absolute", top: 0, height, overflow: "hidden" }, mask]}>
      <Animated.Text accessible={false} style={[textStyle, { position: "absolute", top: 0, left: 0, width }, offset]}>{children}</Animated.Text>
    </Animated.View>
  </View>;
}

function GlitchLayer({ children, layer, time, textStyle, width }: Omit<MotionProps, "effect"> & {
  children: string; layer: -1 | 0 | 1; textStyle: TextStyle; width: number;
}) {
  const motion = useAnimatedStyle(() => {
    "worklet";
    const frame = sampleTitleEntrance("chromatic-glitch", time.value);
    return { opacity: layer === 0 ? frame.opacity : frame.ghost,
      transform: [{ translateX: frame.x + layer * frame.ghost * 30 }, { translateY: layer * frame.ghost * 6 }] };
  }, [layer, time]);
  return <Animated.Text accessible={false} style={[textStyle, { position: "absolute", top: 0, width,
    color: layer === -1 ? "#67e8f9" : layer === 1 ? "#fb7185" : textStyle.color }, motion]}>{children}</Animated.Text>;
}

function buildSlots(text: string, unit: "word" | "letter") {
  const lines = text.split("\n").map(line => line.split(/(\s+)/).filter(Boolean));
  const count = lines.flat().filter(word => word.trim()).reduce((total, word) => total + (unit === "letter" ? Array.from(word).length : 1), 0);
  let index = 0;
  return lines.map(words => {
    const lineCount = words.filter(word => word.trim()).reduce((total, word) => total + (unit === "letter" ? Array.from(word).length : 1), 0);
    let lineIndex = 0;
    return words.map(word => ({ word, slots: word.trim() ? (unit === "letter" ? Array.from(word) : [word])
      .map(text => ({ text, index: index++, count, lineIndex: lineIndex++, lineCount })) : [] }));
  });
}

export function AnimatedTitle({ children, effect = "soft-rise", fontSize = 104, width = 1696, wrap = true, color = "#f8fafc", clock = "slide", textStyle: titleStyle }: {
  children: string | string[]; effect?: TitleEntranceEffect; fontSize?: number; width?: number; wrap?: boolean; color?: string; clock?: "slide" | "step";
  textStyle?: Pick<TextStyle, "fontFamily" | "fontWeight" | "lineHeight" | "letterSpacing">;
}) {
  const title = typeof children === "string" ? children : children.join("");
  const playback = usePlayback();
  const speed = usePresentationValue("titleAnimationSpeed") ?? 1;
  const sampleClock = samplePlayback;
  const duration = titleEntranceDuration(effect);
  const sampled = useSharedValue({ key: "", time: 0 });
  useAnimatedReaction(() => playback.value, state => {
    "worklet";
    if (state.phase === "outgoing" || state.phase === "paused") return;
    const key = clock === "step" ? `${state.slideKey}:${state.stepKey}` : state.slideKey;
    const time = Math.min(duration, sampleClock(state, duration / speed, clock) * speed);
    if (sampled.value.key !== key || sampled.value.time !== time) sampled.value = { key, time };
  }, [clock, speed, duration]);
  const time = useDerivedValue(() => {
    "worklet";
    const state = playback.value;
    if (state.phase === "preview") return 4;
    if (state.phase === "preparing") return 0;
    const key = clock === "step" ? `${state.slideKey}:${state.stepKey}` : state.slideKey;
    return sampled.value.key === key ? sampled.value.time : 0;
  }, [clock]);
  const preset = titleEntranceEffects.find(preset => preset.id === effect)!;
  const textStyle: TextStyle = { fontFamily: "Helvetica Neue", fontSize, lineHeight: Math.ceil(fontSize * 1.24),
    fontWeight: "700", color, textAlign: "center", ...titleStyle };
  const lines = useMemo(() => preset.unit === "word" || preset.unit === "letter" ? buildSlots(title, preset.unit) : [], [title, preset.unit]);
  const motionProps = { effect, time };
  return <View accessible accessibilityRole="header" accessibilityLabel={title} style={{ width, alignSelf: "center" }}>
    {effect === "wipe" || effect === "curtain" ? <MaskedTitle {...motionProps} width={width} textStyle={textStyle}>{title}</MaskedTitle>
      : effect === "chromatic-glitch" ? <View>
        <Text accessible={false} style={[textStyle, { opacity: 0 }]}>{title}</Text>
        {([-1, 1, 0] as const).map(layer => <GlitchLayer key={layer} layer={layer} {...motionProps} width={width} textStyle={textStyle}>{title}</GlitchLayer>)}
      </View>
      : preset.unit === "title" ? <TitleSlot {...motionProps} text={title} index={0} count={1} lineIndex={0} lineCount={1} textStyle={textStyle} />
      : lines.map((words, line) => <View key={line} style={{ flexDirection: "row", flexWrap: wrap ? "wrap" : "nowrap", justifyContent: "center", minHeight: textStyle.lineHeight }}>
        {words.map(({ word, slots }, wordIndex) => slots.length ? <View key={wordIndex} style={{ flexDirection: "row" }}>
          {slots.map(slot => <TitleSlot key={slot.index} {...slot} {...motionProps} textStyle={textStyle} />)}
        </View> : preset.unit === "word" ? <Text key={wordIndex} accessible={false} style={textStyle}>{word}</Text>
          : <View key={wordIndex} style={{ width: word.length * fontSize * 0.28, height: textStyle.lineHeight }} />)}
      </View>)}
  </View>;
}
