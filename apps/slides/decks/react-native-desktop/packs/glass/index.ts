export { MaterialSampler } from "./MaterialSampler";

// A reusable Skia approximation for decks. The native app should use NSGlassEffectView.
export const glassTimeline = { warmup: 4, moreRefraction: 12, peak: 28 } as const;

export const chatGlassUniforms = {
  surfaceA: [0.0143, 0.434, 0.2357, 0.538],
  surfaceB: [0.2786, 0.452, 0.9714, 0.835],
};

export const liquidGlass = `
  uniform shader image;
  uniform float2 resolution;
  uniform float time;
  uniform float strength;
  uniform float4 surfaceA;
  uniform float4 surfaceB;

  float roundedBox(float2 position, float4 normalizedBounds, float radius) {
    float2 minimum = normalizedBounds.xy * resolution;
    float2 maximum = normalizedBounds.zw * resolution;
    float2 center = (minimum + maximum) * 0.5;
    float2 halfSize = (maximum - minimum) * 0.5 - float2(radius);
    float2 q = abs(position - center) - halfSize;
    return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  }

  float materialDistance(float2 position) {
    return min(
      roundedBox(position, surfaceA, 18.0),
      roundedBox(position, surfaceB, 30.0)
    );
  }

  half4 sampleImage(float2 position) {
    return image.eval(clamp(position, float2(0.0), resolution - 1.0));
  }

  half4 main(float2 position) {
    half4 original = sampleImage(position);
    float distance = materialDistance(position);
    float inside = 1.0 - smoothstep(-1.5, 1.5, distance);
    float nearby = 1.0 - smoothstep(0.0, 18.0, distance);
    if (inside <= 0.0 && nearby <= 0.0) return original;

    float joke = 0.16 * smoothstep(${glassTimeline.warmup}.0, ${glassTimeline.moreRefraction}.0, time)
      + 0.84 * smoothstep(${glassTimeline.moreRefraction}.0, ${glassTimeline.peak}.0, time);
    float motion = time * mix(0.32, 1.15, joke);

    float gradientStep = 1.5;
    float2 gradient = float2(
      materialDistance(position + float2(gradientStep, 0.0)) - materialDistance(position - float2(gradientStep, 0.0)),
      materialDistance(position + float2(0.0, gradientStep)) - materialDistance(position - float2(0.0, gradientStep))
    );
    float2 normal = normalize(gradient + float2(0.0001));
    float edge = exp(-abs(distance) / mix(18.0, 34.0, joke));
    float2 wave = float2(
      sin(position.y * 0.020 + motion * 1.7) + sin(position.x * 0.011 - motion) * 0.35,
      cos(position.x * 0.016 - motion * 1.3) + sin(position.y * 0.013 + motion) * 0.3
    );
    float refraction = mix(5.0, strength * 1.25, joke);
    float2 displacement = normal * edge * refraction;
    displacement += wave * mix(0.35, strength * 0.28, joke) * inside;
    float2 samplePosition = position - displacement;

    float blur = mix(1.6, 10.0, joke);
    half4 center = sampleImage(samplePosition);
    half4 blurred = center * 0.42;
    blurred += sampleImage(samplePosition + float2(blur, 0.0)) * 0.145;
    blurred += sampleImage(samplePosition - float2(blur, 0.0)) * 0.145;
    blurred += sampleImage(samplePosition + float2(0.0, blur)) * 0.145;
    blurred += sampleImage(samplePosition - float2(0.0, blur)) * 0.145;

    float chroma = joke * joke * strength * 0.28;
    half4 red = sampleImage(samplePosition + normal * chroma);
    half4 blue = sampleImage(samplePosition - normal * chroma);
    half3 transmitted = half3(red.r, blurred.g, blue.b);
    transmitted = mix(blurred.rgb, transmitted, joke * 0.78);

    float light = pow(max(dot(normal, normalize(float2(-0.72, -0.5))), 0.0), 7.0) * edge;
    float rim = 1.0 - smoothstep(0.8, 3.2, abs(distance));
    float movingCaustic = pow(max(0.0, sin(position.x * 0.018 + position.y * 0.011 - motion * 2.0)), 12.0);
    movingCaustic += pow(max(0.0, sin(position.x * 0.009 - position.y * 0.021 + motion * 1.6)), 16.0) * 0.7;
    movingCaustic *= edge * joke;
    half3 glass = transmitted * mix(0.97, 1.04, inside);
    glass += half3(0.05, 0.11, 0.13) * inside;
    glass += half3(0.72, 0.92, 1.0) * (light * mix(0.28, 0.95, joke) + rim * 0.22 + movingCaustic * 0.72);

    float outsideShadow = (1.0 - inside) * nearby * (1.0 - smoothstep(2.0, 18.0, distance)) * 0.18;
    half3 withShadow = original.rgb * (1.0 - outsideShadow);
    half3 color = mix(withShadow, glass, inside);
    return half4(color, original.a);
  }
`;
