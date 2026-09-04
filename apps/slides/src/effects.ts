export const effectPresets = {
  liquid: `
    uniform shader image;
    uniform float2 resolution;
    uniform float time;
    uniform float strength;

    half4 main(float2 position) {
      float2 uv = position / resolution;
      float2 samplePosition = position;
      samplePosition.x += sin(uv.y * 18.0 + time * 2.1) * strength;
      samplePosition.x += sin(uv.y * 41.0 - time * 1.3) * strength * 0.28;
      samplePosition.y += sin(uv.x * 15.0 - time * 1.7) * strength * 0.45;
      half4 color = image.eval(samplePosition);
      float shimmer = (sin(uv.y * 18.0 + time * 2.1) * 0.5 + 0.5) * 0.08;
      return half4(color.rgb + shimmer * color.a, color.a);
    }
  `,
  ripple: `
    uniform shader image;
    uniform float2 resolution;
    uniform float time;
    uniform float strength;

    half4 main(float2 position) {
      float2 delta = position - resolution * 0.5;
      float distanceFromCenter = length(delta);
      float2 direction = delta / max(distanceFromCenter, 1.0);
      float wave = sin(distanceFromCenter * 0.045 - time * 4.0);
      float envelope = 1.0 - smoothstep(0.0, length(resolution) * 0.5, distanceFromCenter);
      return image.eval(position + direction * wave * strength * envelope);
    }
  `,
  glitch: `
    uniform shader image;
    uniform float2 resolution;
    uniform float time;
    uniform float strength;

    half4 main(float2 position) {
      float band = floor(position.y / max(6.0, strength));
      float pulse = step(0.72, fract(sin(band * 91.7 + floor(time * 12.0)) * 43758.5));
      float offset = pulse * sin(band * 3.1 + time * 17.0) * strength;
      half4 red = image.eval(position + float2(offset + strength * 0.22, 0.0));
      half4 green = image.eval(position + float2(offset, 0.0));
      half4 blue = image.eval(position + float2(offset - strength * 0.22, 0.0));
      return half4(red.r, green.g, blue.b, max(red.a, max(green.a, blue.a)));
    }
  `,
  pixelate: `
    uniform shader image;
    uniform float2 resolution;
    uniform float time;
    uniform float strength;

    half4 main(float2 position) {
      float blockSize = max(1.0, strength);
      float2 samplePosition = (floor(position / blockSize) + 0.5) * blockSize;
      return image.eval(samplePosition);
    }
  `,
} as const;

export type EffectPreset = keyof typeof effectPresets;

export function resolveEffectSource(preset: string, shader?: string) {
  if (shader) {
    return shader;
  }
  return preset in effectPresets ? effectPresets[preset as EffectPreset] : undefined;
}
