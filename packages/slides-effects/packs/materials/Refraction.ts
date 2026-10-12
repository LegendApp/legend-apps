export type RefractionOptions = { radii?: readonly [number, number]; intensity?: number; ramp?: { response: number; moreRefraction: number; peak: number } };
export function createRefractionShader({ radii = [18,30], intensity = 1, ramp }: RefractionOptions = {}) {
  if (radii.some(n => !Number.isFinite(n) || n < 0) || ramp && (![ramp.response, ramp.moreRefraction, ramp.peak].every(Number.isFinite) || ramp.response < 0 || ramp.moreRefraction <= ramp.response || ramp.peak <= ramp.moreRefraction)) throw new Error("Invalid refraction radii or ramp");
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error("Invalid refraction intensity");
  const value = (n: number) => n.toFixed(6);
  const progress = ramp ? `0.08 * smoothstep(0.0, ${value(ramp.response)}, time)
      + 0.08 * smoothstep(${value(ramp.response)}, ${value(ramp.moreRefraction)}, time)
      + 0.84 * smoothstep(${value(ramp.moreRefraction)}, ${value(ramp.peak)}, time)` : "1.0";
  return `
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
      roundedBox(position, surfaceA, ${radii[0].toFixed(6)}),
      roundedBox(position, surfaceB, ${radii[1].toFixed(6)})
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

    float materialProgress = ${progress};
    float motion = time * mix(0.32, 1.15, materialProgress);

    float gradientStep = 1.5;
    float2 gradient = float2(
      materialDistance(position + float2(gradientStep, 0.0)) - materialDistance(position - float2(gradientStep, 0.0)),
      materialDistance(position + float2(0.0, gradientStep)) - materialDistance(position - float2(0.0, gradientStep))
    );
    float2 normal = normalize(gradient + float2(0.0001));
    float edge = exp(-abs(distance) / mix(18.0, 34.0, materialProgress));
    float2 wave = float2(
      sin(position.y * 0.020 + motion * 1.7) + sin(position.x * 0.011 - motion) * 0.35,
      cos(position.x * 0.016 - motion * 1.3) + sin(position.y * 0.013 + motion) * 0.3
    );
    float refraction = mix(5.0, strength * 1.25, materialProgress);
    float2 displacement = normal * edge * refraction;
    displacement += wave * mix(0.35, strength * 0.28, materialProgress) * inside;
    float2 samplePosition = position - displacement;

    float blur = mix(1.6, 10.0, materialProgress);
    half4 center = sampleImage(samplePosition);
    half4 blurred = center * 0.42;
    blurred += sampleImage(samplePosition + float2(blur, 0.0)) * 0.145;
    blurred += sampleImage(samplePosition - float2(blur, 0.0)) * 0.145;
    blurred += sampleImage(samplePosition + float2(0.0, blur)) * 0.145;
    blurred += sampleImage(samplePosition - float2(0.0, blur)) * 0.145;

    float chroma = materialProgress * materialProgress * strength * 0.28;
    half4 red = sampleImage(samplePosition + normal * chroma);
    half4 blue = sampleImage(samplePosition - normal * chroma);
    half3 transmitted = half3(red.r, blurred.g, blue.b);
    transmitted = mix(blurred.rgb, transmitted, materialProgress * 0.78);

    float light = pow(max(dot(normal, normalize(float2(-0.72, -0.5))), 0.0), 7.0) * edge;
    float rim = 1.0 - smoothstep(0.8, 3.2, abs(distance));
    float movingCaustic = pow(max(0.0, sin(position.x * 0.018 + position.y * 0.011 - motion * 2.0)), 12.0);
    movingCaustic += pow(max(0.0, sin(position.x * 0.009 - position.y * 0.021 + motion * 1.6)), 16.0) * 0.7;
    movingCaustic *= edge * materialProgress;
    half3 glass = transmitted * mix(0.97, 1.04, inside);
    glass += half3(0.05, 0.11, 0.13) * inside;
    glass += half3(0.72, 0.92, 1.0) * (light * mix(0.28, 0.95, materialProgress) + rim * 0.22 + movingCaustic * 0.72);

    float outsideShadow = (1.0 - inside) * nearby * (1.0 - smoothstep(2.0, 18.0, distance)) * 0.18;
    half3 withShadow = original.rgb * (1.0 - outsideShadow);
    half3 color = mix(withShadow, glass, inside);
    return half4(${intensity === 1 ? "color" : `mix(original.rgb, color, ${value(intensity)})`}, original.a);
  }
`;
}
