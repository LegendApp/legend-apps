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
export type AtmosphereVariant = "fluid" | "smoke" | "wireframe" | "glass" | "droplets";

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
  droplets: `
    float mergeDistance(float a, float b) {
      float h = max(0.09 - abs(a - b), 0.0) / 0.09;
      return min(a, b) - h * h * 0.0225;
    }
    float dropletDistance(float2 p, float t) {
      // Crossing orbits bring different neighbors together instead of leaving
      // one isolated satellite. Different periods keep the groups changing.
      float a = length(p - float2(-0.36 + sin(t * 0.85) * 0.21, 0.16 + cos(t * 0.67) * 0.09)) - 0.185;
      float b = length(p - float2(0.04 + cos(t * 0.92) * 0.23, 0.19 + sin(t * 0.73) * 0.10)) - 0.155;
      float c = length(p - float2(0.38 + sin(t * 0.79 + 1.4) * 0.19, -0.19 + cos(t * 0.91) * 0.14)) - 0.14;
      float d = length(p - float2(-0.32 + cos(t * 0.76 + 0.7) * 0.22, -0.22 + sin(t * 0.88) * 0.12)) - 0.13;
      float e = length(p - float2(0.03 + sin(t * 0.69 + 2.1) * 0.26, -0.12 + cos(t * 0.83) * 0.20)) - 0.105;
      float f = length(p - float2(0.42 + cos(t * 0.81 + 2.8) * 0.17, 0.21 + sin(t * 0.95) * 0.11)) - 0.115;
      return mergeDistance(mergeDistance(mergeDistance(a, b), mergeDistance(c, d)), mergeDistance(e, f));
    }
    float3 dropletBackdrop(float2 p) {
      // Sample this same environment at displaced coordinates inside each lens.
      float light = exp(-dot(p - float2(-0.5, -0.35), p - float2(-0.5, -0.35)) * 3.0);
      float glow = exp(-dot(p - float2(0.55, 0.30), p - float2(0.55, 0.30)) * 5.0);
      float2 cell = abs(fract(p / 0.12 + 0.5) - 0.5) * 0.12;
      float aa = 1.3 / resolution.y;
      float grid = 1.0 - smoothstep(0.0, aa, min(cell.x, cell.y));
      return float3(0.006, 0.009, 0.014)
        + float3(0.036, 0.049, 0.067) * light
        + float3(0.020, 0.033, 0.045) * glow
        + float3(0.025, 0.033, 0.044) * grid;
    }
    half4 main(float2 position) {
      float2 p = (position / resolution - 0.5) * float2(resolution.x / resolution.y, 1.0);
      float t = time * 0.6;
      float d = dropletDistance(p, t);
      float epsilon = 0.001;
      float2 gradient = float2(
        dropletDistance(p + float2(epsilon, 0), t) - dropletDistance(p - float2(epsilon, 0), t),
        dropletDistance(p + float2(0, epsilon), t) - dropletDistance(p - float2(0, epsilon), t));
      float2 normal = gradient / max(length(gradient), 0.00001);
      float depth = max(-d, 0.0);
      float inside = 1.0 - smoothstep(-1.0 / resolution.y, 1.0 / resolution.y, d);
      // Refraction peaks inside the bevel and relaxes into a clear interior.
      float bend = 0.065 * (1.0 - exp(-depth * 180.0)) * exp(-depth * 22.0);
      float3 backdrop = dropletBackdrop(p);
      float3 glass = dropletBackdrop(p - normal * bend);
      float directional = pow(abs(dot(normal, normalize(float2(-0.6, -0.8)))), 5.0);
      float rim = exp(-abs(d) * 700.0);
      float shoulder = exp(-depth * 65.0) * inside;
      float shadow = exp(-abs(d - 0.008) * 140.0) * (1.0 - inside);
      float3 color = mix(backdrop, glass * 1.13 + float3(0.004, 0.006, 0.009), inside);
      color *= 1.0 - shadow * 0.30;
      color += float3(0.68, 0.77, 0.88) * (rim * (0.035 + directional * 0.20)
        + shoulder * directional * 0.065);
      return half4(color * brightness, 1.0);
    }
  `,
  glass: `
    half4 main(float2 position) {
      float2 uv = position / resolution;
      float2 p = (uv - 0.5) * float2(resolution.x / resolution.y, 1.0);
      float t = time * 0.12;
      // A continuous glass sheet: analytic surface slopes bend a soft environment
      // reflection across the full viewport. No lens silhouettes or edge mask.
      float a = p.x * 2.7 + p.y * 1.4 + t * 0.45;
      float b = p.x * -1.3 + p.y * 3.2 - t * 0.35;
      float c = p.x * 4.1 - p.y * 2.4 + sin(t * 0.2) * 0.6;
      float height = sin(a) * 0.18 + sin(b) * 0.12 + sin(c) * 0.035;
      float2 slope = float2(
        cos(a) * 0.486 - cos(b) * 0.156 + cos(c) * 0.1435,
        cos(a) * 0.252 + cos(b) * 0.384 - cos(c) * 0.084);
      float2 refracted = p + slope * 0.65;
      float lightBand = refracted.y + refracted.x * 0.38 + height * 0.3;
      float facing = 0.65 + 0.35 * cos(a - b);
      float3 color = float3(0.006, 0.008, 0.012);
      // Narrow reflection crests with broader shoulders give the glass a readable
      // surface. The offset dark trough makes each fold feel refractive, not hazy.
      for (int i = 0; i < 3; i++) {
        float band = lightBand - (float(i) - 1.0) * 0.38;
        float crest = exp(-pow(band * 68.0, 2.0));
        float shoulder = exp(-pow((band + 0.018) * 19.0, 2.0));
        float trough = exp(-pow((band - 0.035) * 25.0, 2.0));
        float highlight = (crest * 0.19 + shoulder * 0.065) * facing;
        color += float3(0.70, 0.82, 0.96) * highlight;
        color *= 1.0 - trough * 0.35;
      }
      return half4(color * brightness, 1.0);
    }
  `,
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
    : variant === "wireframe" ? effects.wireframe
    : variant === "glass" ? effects.glass
    : variant === "droplets" ? effects.droplets : effects.fluid;
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

export function Droplets(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="droplets" />; }
export function GlassAtmosphere(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="glass" />; }
export function Fluid(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="fluid" />; }
export function Smoke(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="smoke" />; }
export function Wireframe(props: AtmosphereProps) { return <AnimatedAtmosphere {...props} variant="wireframe" />; }

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject } });
