export const atmosphereCommon = `
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
