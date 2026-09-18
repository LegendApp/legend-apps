import { useAnimatedShaderUniforms, useBackgroundSize } from "@legend-apps/presentation";
import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { StyleSheet, View } from "react-native";

export type AtmosphereProps = {
  /** Light output multiplier: 0 is black, 1 is the designed brightness. */
  brightness?: number;
  /** Motion multiplier: 0 holds a still frame, 1 is the designed speed. */
  speed?: number;
  /** Extra motion on slide changes, relative to speed. Set 0 to disable. */
  slideChangeBoost?: number;
};
export type AtmosphereVariant = "fluid" | "smoke" | "wireframe";

const common = `
  uniform float2 resolution;
  uniform float time;
  uniform float brightness;
  float noise(float2 p) {
    float2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, float2(127.1, 311.7))) * 43758.5453);
    float b = fract(sin(dot(i + float2(1,0), float2(127.1,311.7))) * 43758.5453);
    float c = fract(sin(dot(i + float2(0,1), float2(127.1,311.7))) * 43758.5453);
    float d = fract(sin(dot(i + float2(1,1), float2(127.1,311.7))) * 43758.5453);
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(float2 p) {
    float value = 0.0, amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p = float2(p.x * 1.6 - p.y * 1.2, p.x * 1.2 + p.y * 1.6) + 3.7;
      amplitude *= 0.5;
    }
    return value;
  }
  float edges(float2 uv) {
    float left = exp(-length((uv - float2(-0.08, 0.82)) * float2(2.8, 1.5)) * 2.0);
    float right = exp(-length((uv - float2(1.08, 0.12)) * float2(2.8, 1.5)) * 2.0);
    float quiet = smoothstep(0.18, 0.6, length((uv - 0.5) * float2(1.0, 1.4)));
    return (left + right) * quiet;
  }
`;

const sources: Record<AtmosphereVariant, string> = {
  fluid: `
    half4 main(float2 position) {
      float2 uv = position / resolution;
      float2 p = (uv - 0.5) * float2(resolution.x / resolution.y, 1.0) * 3.0;
      float t = time * 0.13;
      float2 q = float2(fbm(p + float2(t, -t * 0.4)), fbm(p + float2(4.7, 1.3) - t * 0.6));
      float field = fbm(p + q * 3.6 + float2(-t * 0.3, t * 0.2));
      float folds = sin(field * 27.0 + q.x * 4.0);
      float ridge = pow(max(0.0, folds), 14.0);
      float sheen = pow(max(0.0, sin(field * 27.0 + q.x * 4.0 + 0.5)), 4.0);
      float3 color = float3(0.035, 0.09, 0.14) * (0.3 + field);
      color += float3(0.20, 0.38, 0.49) * ridge + float3(0.05, 0.13, 0.19) * sheen;
      return half4(color * edges(uv) * brightness, 1.0);
    }
  `,
  smoke: `
    half4 main(float2 position) {
      float2 uv = position / resolution;
      float aspect = resolution.x / resolution.y;
      float t = time * 0.09;
      float2 p = uv * float2(aspect, 1.0);
      float transmittance = 1.0;
      float3 color = float3(0.0);
      // Translucent layers give the plume body and self-occlusion, rather than
      // tracing a narrow noise contour (which reads as a glowing liquid edge).
      for (int layer = 0; layer < 3; layer++) {
        float depth = float(layer);
        float2 q = p * (3.0 + depth * 0.65) + float2(depth * 7.3, t * (0.7 + depth * 0.12));
        float2 curl = float2(fbm(q + float2(0.0, t * 0.15)), fbm(q + float2(5.2, 1.3)));
        float billow = fbm(q + (curl - 0.5) * 2.8);
        float detail = fbm(q * 2.7 + curl * 2.0);
        float turbulence = billow * 0.8 + detail * 0.2;
        // Rising columns spread and meander as they climb along opposite edges.
        float rise = 1.0 - uv.y;
        float leftCenter = 0.025 + sin(rise * 7.0 + t * 0.45 + depth * 0.6) * 0.06;
        float rightCenter = 0.98 + sin(rise * 6.0 - t * 0.35 + depth) * 0.055;
        float width = 0.07 + rise * 0.09;
        float left = exp(-pow((uv.x - leftCenter) / width, 2.0));
        float right = exp(-pow((uv.x - rightCenter) / (0.09 + uv.y * 0.08), 2.0));
        float envelope = min(1.0, left + right);
        float density = smoothstep(0.27, 0.68, turbulence) * envelope;
        float opacity = 1.0 - exp(-density * 0.85);
        float lighting = 0.35 + smoothstep(0.3, 0.7, billow) * 0.65;
        float3 smokeColor = float3(0.22, 0.255, 0.29) * lighting;
        color += transmittance * opacity * smokeColor;
        transmittance *= 1.0 - opacity;
      }
      float quiet = smoothstep(0.20, 0.52, abs(uv.x - 0.5));
      return half4(color * quiet * brightness, 1.0);
    }
  `,
  wireframe: `
    half4 main(float2 position) {
      float2 uv = position / resolution;
      float aspect = resolution.x / resolution.y;
      float2 p = (uv - 0.5) * float2(aspect, 1.0);
      float t = time * 0.12;
      float bend = sin(p.x * 3.0 + t) * 0.15 + sin(p.y * 4.0 - t * 0.6) * 0.09;
      float2 mesh = float2(p.x + sin(p.y * 3.0 + t) * 0.16, p.y + bend);
      float2 grid = mesh * float2(32.0, 23.0);
      float2 distanceToLine = abs(fract(grid + 0.5) - 0.5);
      // Analytic screen-space gradients: RuntimeEffect does not expose dFdx/dFdy.
      float2 aa = float2(32.0 * (1.0 + abs(cos(p.y * 3.0 + t) * 0.48)),
        23.0 * (abs(cos(p.x * 3.0 + t) * 0.45) + abs(1.0 + cos(p.y * 4.0 - t * 0.6) * 0.36))) / resolution.y;
      float2 lines = 1.0 - smoothstep(aa * 0.3, aa * 1.15, distanceToLine);
      float line = max(lines.x, lines.y);
      float folds = 0.5 + 0.5 * sin(mesh.x * 5.0 + mesh.y * 3.0 + t);
      float3 color = mix(float3(0.07, 0.16, 0.23), float3(0.30, 0.43, 0.52), folds);
      return half4(color * line * edges(uv) * brightness, 1.0);
    }
  `,
};

const effects = Object.fromEntries(Object.entries(sources).map(([name, source]) => {
  const effect = Skia.RuntimeEffect.Make(common + source);
  if (!effect) throw new Error(`Could not compile ${name} background shader`);
  return [name, effect];
})) as Record<AtmosphereVariant, NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>>;

/** One persistent canvas, driven by the host's UI-thread clock. Previews stay still. */
export function AnimatedAtmosphere({ variant = "fluid", brightness = 1, speed = 1, slideChangeBoost }: AtmosphereProps & { variant?: AtmosphereVariant }) {
  const { width, height } = useBackgroundSize();
  // Decks are evaluated at runtime, so props can bypass the TypeScript union.
  const effect = variant === "smoke" ? effects.smoke
    : variant === "wireframe" ? effects.wireframe : effects.fluid;
  const idleSpeed = 0.16;
  const motionSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 1;
  const uniforms = useAnimatedShaderUniforms({
    resolution: [Math.max(1, width), Math.max(1, height)],
    brightness: Number.isFinite(brightness) ? Math.max(0, brightness) : 1,
  }, 8, {
    speed: motionSpeed * idleSpeed,
    slideChangeBoost: motionSpeed * (slideChangeBoost ?? idleSpeed * 2),
    slideChangeDuration: 3.5,
  });
  return (
    <View pointerEvents="none" style={styles.fill}>
      <Canvas style={styles.fill}>
        <Fill><Shader source={effect} uniforms={uniforms} /></Fill>
      </Canvas>
    </View>
  );
}

export function Fluid(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="fluid" />; }
export function Smoke(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="smoke" />; }
export function Wireframe(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="wireframe" />; }

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject } });
