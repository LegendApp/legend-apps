// Deliberately bad imitation for a visual joke, not Apple's Liquid Glass or a benchmark.
// Strength is in logical pixels; the host scales it and resolution for the capture.
export const glassTimeline = { warmup: 4, moreRefraction: 12, peak: 28 } as const;

export const counterfeitGlass = `
  uniform shader image;
  uniform float2 resolution;
  uniform float time;
  uniform float strength;

  half4 main(float2 position) {
    // Ramp inside the shader so the captured content never needs to re-render.
    // Once the ramp finishes, keep animating at maximum absurdity until advance.
    float escalation = 0.2 * smoothstep(${glassTimeline.warmup}.0, ${glassTimeline.moreRefraction}.0, time)
      + 0.8 * smoothstep(${glassTimeline.moreRefraction}.0, ${glassTimeline.peak}.0, time);
    float intensity = mix(strength / 30.0, strength, escalation);
    float motionTime = time * mix(0.7, 1.7, escalation);
    float2 uv = position / resolution;
    float amount = intensity / resolution.y;
    float2 center = float2(0.48 + sin(motionTime * 0.65) * 0.2, 0.5);
    float2 delta = uv - center;
    delta.x *= resolution.x / resolution.y;
    float radius = length(delta);
    float lens = 1.0 - smoothstep(0.12, 0.65, radius);
    float2 wave = float2(
      sin(uv.y * 19.0 + motionTime * 1.8) + sin(uv.x * 11.0 - motionTime) * 0.5,
      cos(uv.x * 15.0 - motionTime * 1.4) + sin(uv.y * 27.0 + motionTime) * 0.4
    );
    float2 warped = uv + wave * amount;
    warped += (uv - center) * lens * amount * 3.0;
    // Mirrored edges turn excessive refraction into funhouse repetition without holes.
    warped = 1.0 - abs(mod(warped, 2.0) - 1.0);
    float2 p = warped * resolution;
    float fringe = intensity * (0.12 + lens * 0.3);
    half4 red = image.eval(clamp(p + float2(fringe, 0.0), float2(0.0), resolution - 1.0));
    half4 green = image.eval(p);
    half4 blue = image.eval(clamp(p - float2(fringe, 0.0), float2(0.0), resolution - 1.0));
    float highlight = pow(max(0.0, sin(radius * 32.0 - motionTime * 1.8)), 14.0);
    half3 rgb = half3(red.r, green.g, blue.b);
    rgb += half3(0.45, 0.8, 1.0) * highlight * min(amount * 2.0, 0.5);
    return half4(rgb, 1.0);
  }
`;
