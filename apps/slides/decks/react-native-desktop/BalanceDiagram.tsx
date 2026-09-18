import type { ReactNode } from "react";
import { Canvas, Fill, Group, Paint, Path, RuntimeShader, Shader, Skia, Text as SkiaText, TextPath, matchFont } from "@shopify/react-native-skia";
import { SceneMotionView, useAnimatedShaderUniforms, usePresentationValue } from "@legend-apps/presentation";
import { StyleSheet, View } from "react-native";

// Satin glass is shaded procedurally, not a bitmap or a backdrop capture.
// Deformation and text refraction stay on the GPU; curved labels share the exact same deformation and clock as their bubbles.
const deformationSource = `
  float rimOffset(float angle, float time, float phase) {
    float t = time * 0.8 + phase;
    return sin(t) * 2.0 + sin(angle * 3.0 + t * 0.65) * 4.5
      + cos(angle * 2.0 - t * 0.45) * 3.0;
  }
`;
const glassSource = deformationSource + `
  uniform float time;
  uniform float fail;

  half4 bubble(float2 p, float2 center, float radius, float3 tint, float phase) {
    float2 delta = p - center;
    float angle = atan(delta.y, delta.x);
    float t = time * 0.8 + phase;
    float distance = length(delta) - radius - rimOffset(angle, time, phase);
    float inside = 1.0 - smoothstep(-0.8, 0.8, distance);
    float depth = clamp(-distance / radius, 0.0, 1.0);
    float light = 0.55 + 0.45 * cos(angle + 2.2);
    float rim = exp(-abs(distance) * 0.38);
    float innerRim = exp(-abs(distance + 5.0) * 0.16) * inside;
    float satin = (0.10 + 0.075 * (1.0 - depth) + 0.025 * sin(angle + t * 0.15)) * inside;
    float alpha = clamp(satin + rim * (0.12 + light * 0.20) + innerRim * 0.07, 0.0, 0.88);
    float3 color = mix(tint, float3(0.66, 0.75, 0.84), clamp(rim * light * 0.55 + innerRim * 0.12, 0.0, 1.0));
    return half4(color * alpha, alpha);
  }
  half4 over(half4 front, half4 back) {
    return front + back * (1.0 - front.a);
  }
  half4 main(float2 p) {
    if (fail > 0.5) {
      return bubble(p, float2(260, 360), 226.0, float3(0.53, 0.25, 0.30), 3.4);
    }
    half4 performance = bubble(p, float2(365,275), 255.0, float3(0.20,0.56,0.57), 0.0);
    half4 memory = bubble(p, float2(635,275), 255.0, float3(0.31,0.45,0.70), 2.0);
    half4 nativeUI = bubble(p, float2(500,450), 255.0, float3(0.51,0.38,0.68), 4.2);
    return over(nativeUI, over(memory, performance));
  }
`;
const glass = Skia.RuntimeEffect.Make(glassSource);
if (!glass) throw new Error("Could not compile the satin Venn shader");

const refractionSource = `
  uniform shader image;
  uniform float time;
  uniform float fail;
  half4 main(float2 p) {
    float t = time * 0.8;
    // Broad moving lens bands distort the text as a continuous glass surface.
    float wave = sin(p.x * 0.009 + p.y * 0.005 - t);
    float strength = pow(0.5 + 0.5 * wave, 3.0);
    float2 offset = float2(sin(p.y * 0.012 + t), cos(p.x * 0.01 - t)) * strength * 4.0;
    half4 ink = image.eval(p + offset);
    // Passing light subtly changes the lettering as the lens travels across it.
    return half4(min(ink.rgb * (0.78 + strength * 0.34), float3(ink.a)), ink.a);
  }
`;
const refraction = Skia.RuntimeEffect.Make(refractionSource);
if (!refraction) throw new Error("Could not compile the Venn text refraction shader");
const frameworkFont = matchFont({ fontFamily: "Helvetica Neue", fontSize: 30 });

function Glass({ fail = false, children }: { fail?: boolean; children: ReactNode }) {
  const uniforms = useAnimatedShaderUniforms({ fail: fail ? 1 : 0 }, 8);
  return <Canvas style={StyleSheet.absoluteFill}>
    <Fill><Shader source={glass!} uniforms={uniforms} /></Fill>
    <Group layer={<Paint><RuntimeShader source={refraction!} uniforms={uniforms} /></Paint>}>
      {children}
    </Group>
    {(fail ? failBadges : vennBadges).map((badge) => <Group key={badge.label}
      layer={<Paint><RuntimeShader source={badge.effect} uniforms={uniforms} /></Paint>}>
      <Fill color="transparent" />
      <Path path={badge.ribbon} style="stroke" strokeWidth={56} strokeCap="round" color="rgba(215,232,250,0.55)" />
      <Path path={badge.ribbon} style="stroke" strokeWidth={53} strokeCap="round" color={badge.color} />
      <TextPath path={badge.textPath} text={badge.label} font={categoryFont} color="#eef0f5" />
    </Group>)}
  </Canvas>;
}

const categoryFont = matchFont({ fontFamily: "Helvetica Neue", fontSize: 36, fontWeight: "700" });

function arc(x: number, y: number, radius: number, angle: number, span: number, reverse = false) {
  const path = Skia.Path.Make();
  const direction = reverse ? -1 : 1;
  for (let i = 0; i <= 100; i++) {
    const theta = angle + direction * span * (i / 100 - 0.5);
    const px = x + radius * Math.cos(theta), py = y + radius * Math.sin(theta);
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  return path;
}

function makeBadge(label: string, x: number, y: number, radius: number, angle: number, phase: number, color: string, reverse = false) {
  const baseline = radius + (reverse ? 12 : -12);
  const textSpan = (categoryFont.measureText(label).width + 6) / baseline;
  const effect = Skia.RuntimeEffect.Make(deformationSource + `
    uniform shader image;
    uniform float time;
    uniform float fail;
    half4 main(float2 p) {
      float2 delta = p - float2(${x.toFixed(1)}, ${y.toFixed(1)});
      float angle = atan(delta.y, delta.x);
      float offset = rimOffset(angle, time, ${phase.toFixed(1)});
      return image.eval(p - delta / max(length(delta), 0.001) * offset);
    }
  `);
  if (!effect) throw new Error("Could not compile the curved Venn label shader");
  return { label, color, effect,
    ribbon: arc(x, y, radius, angle, textSpan, reverse),
    textPath: arc(x, y, baseline, angle, textSpan, reverse),
  };
}
const vennBadges = [
  makeBadge("Performance", 365, 275, 255, -2.478, 0, "rgba(34,74,79,0.8)"),
  makeBadge("Memory", 635, 275, 255, -0.664, 2, "rgba(44,57,85,0.8)"),
  makeBadge("Native UI", 500, 450, 255, Math.PI / 2, 4.2, "rgba(62,46,78,0.8)", true),
];
const failBadges = [makeBadge("Fail", 260, 360, 226, -Math.PI / 2, 3.4, "rgba(78,40,49,0.8)")];

function Framework({ name, x, y }: { name: string; x: number; y: number }) {
  const font = frameworkFont;
  const width = font.measureText(name).width;
  return <SkiaText text={name} font={font} x={x - width / 2} y={y + 11}
    color="#eef0f5" />;
}

export function BalanceDiagram() {
  const showFail = usePresentationValue("stepIndex") > 0;
  return <View accessible accessibilityLabel={showFail ? "Performance, Memory, Native UI: React Native and AppKit meet all three; GPUI and Tauri meet Performance; SwiftUI meets Memory and Native UI. Fail: Flutter, Deno WebView, Electron, Deno CEF" : "Performance, Memory, Native UI: React Native and AppKit meet all three; GPUI and Tauri meet Performance; SwiftUI meets Memory and Native UI"} style={{ width: 1696, height: 740, alignSelf: "center", marginTop: 16, overflow: "hidden", transform: [{ scale: 0.94 }] }}>
    <SceneMotionView duration={480} pose={{ x: showFail ? 0 : 348 }}
      style={{ position: "absolute", width: 1000, height: 740 }}>
      <Glass>
      <Framework name="GPUI" x={275} y={165} />
      <Framework name="Tauri" x={235} y={240} />
      <Framework name="React Native" x={500} y={335} />
      <Framework name="AppKit" x={500} y={385} />
      <Framework name="SwiftUI" x={660} y={450} />
      </Glass>
    </SceneMotionView>
    <SceneMotionView duration={480} hidden={!showFail}
      pose={{ x: showFail ? 1110 : 1770, opacity: showFail ? 1 : 0 }}
      style={{ position: "absolute", width: 520, height: 740 }}>
      <Glass fail>
      <Framework name="Flutter" x={260} y={270} />
      <Framework name="Deno WebView" x={260} y={330} />
      <Framework name="Electron" x={260} y={390} />
      <Framework name="Deno CEF" x={260} y={450} />
      </Glass>
    </SceneMotionView>
  </View>;
}
