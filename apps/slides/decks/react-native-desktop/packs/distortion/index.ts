export type DistortionTiming = {
  delaySeconds?: number;
  durationSeconds?: number;
  intervalSeconds?: number;
};

export function distortionTiming({
  delaySeconds = 2.8,
  durationSeconds = 0.36,
  intervalSeconds = 8,
}: DistortionTiming = {}) {
  return { delaySeconds, durationSeconds, intervalSeconds };
}

export const subtleFaultTiming = distortionTiming({
  delaySeconds: 3,
  durationSeconds: 0.34,
  intervalSeconds: 8.5,
});

export const prismaticTear = `
  uniform shader image;
  uniform float2 resolution;
  uniform float time;
  uniform float strength;
  uniform float delaySeconds;
  uniform float durationSeconds;
  uniform float intervalSeconds;

  half4 main(float2 position) {
    float2 uv = position / resolution;
    float safeInterval = max(intervalSeconds, durationSeconds + 0.01);
    float elapsed = max(0.0, time - delaySeconds);
    float cycle = floor(elapsed / safeInterval);
    float localTime = mod(elapsed, safeInterval);
    float attack = smoothstep(0.0, min(0.08, durationSeconds * 0.25), localTime);
    float release = 1.0 - smoothstep(durationSeconds * 0.45, durationSeconds, localTime);
    float event = step(delaySeconds, time) * attack * release;
    float band = floor(position.y / 24.0);
    float noise = fract(sin(band * 91.7 + cycle * 37.3) * 43758.5);
    float pulse = step(0.86, noise) * event;
    float envelope = smoothstep(0.04, 0.18, uv.y) * (1.0 - smoothstep(0.82, 0.96, uv.y));
    float offset = pulse * sin(band * 3.1 + localTime * 28.0) * strength * envelope;
    float split = pulse * strength * 0.12;
    half4 red = image.eval(clamp(position + float2(offset + split, 0.0), float2(0.0), resolution - 1.0));
    half4 green = image.eval(clamp(position + float2(offset, 0.0), float2(0.0), resolution - 1.0));
    half4 blue = image.eval(clamp(position + float2(offset - split, 0.0), float2(0.0), resolution - 1.0));
    half4 distorted = half4(red.r, green.g, blue.b, max(red.a, max(green.a, blue.a)));
    return mix(image.eval(position), distorted, event);
  }
`;

export const softRipple = `
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
`;
