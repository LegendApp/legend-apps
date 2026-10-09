import { atmosphereCommon } from "./common";
import { Atmosphere, type AtmosphereProps } from "./Atmosphere";
export const smokeSource = atmosphereCommon + `
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
  `;
export function Smoke(props: AtmosphereProps) { return <Atmosphere {...props} source={smokeSource} persistentBackground={false} />; }
