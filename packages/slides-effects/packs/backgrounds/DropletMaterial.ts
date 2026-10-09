export const dropletMaterial = `
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
    float3 shadeDroplet(float2 p, float d, float2 normal) {
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
      return color;
    }
`;
