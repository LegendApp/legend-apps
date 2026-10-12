import { atmosphereCommon } from "./common";
import { Atmosphere, type AtmosphereProps } from "./Atmosphere";
export const fluidSource = atmosphereCommon + `
    uniform float effectIntensity;
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
      color += (float3(0.20, 0.38, 0.49) * ridge + float3(0.05, 0.13, 0.19) * sheen) * effectIntensity;
      return half4(color * edges(uv) * brightness, 1.0);
    }
  `;
export function Fluid(props: AtmosphereProps) { return <Atmosphere {...props} source={fluidSource} persistentBackground={false} />; }
