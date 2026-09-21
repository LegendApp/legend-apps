// Shared with the "Change the focus" gallery slide.
export const liquidGlassShader = `
  uniform shader image;
  uniform float2 resolution;
  uniform float strength;
  uniform float time;
  uniform float progress;
  uniform float liquid;
  half4 main(float2 p) {
    float2 uv = p / resolution;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rim = exp(-edge * 65.0);
    float2 normal = normalize(uv - 0.5 + float2(0.0001));
    float forming = sin(progress * 3.141593);
    float wave = sin(length(uv - 0.5) * 32.0 - progress * 15.0);
    float2 bend = normal * strength * (rim * progress + wave * forming * (0.4 + liquid));
    half4 color = image.eval(clamp(p + bend, float2(0.0), resolution - 1.0));
    float highlight = rim * (0.05 + 0.10 * max(0.0, 1.0 - uv.y));
    color.rgb = mix(color.rgb, half3(0.075, 0.12, 0.17) * color.a, progress * 0.16);
    color.rgb += half3(0.65, 0.88, 1.0) * (highlight * progress + forming * rim * 0.1) * color.a;
    return color;
  }
`;
