import { atmosphereCommon } from "./common";
import { Atmosphere, type AtmosphereProps } from "./Atmosphere";
export const wireframeSource = atmosphereCommon + `
    half4 main(float2 position) {
      float2 uv = position / resolution;
      float aspect = resolution.x / resolution.y;
      float2 p = (uv - 0.5) * float2(aspect, 1.0);
      float t = time * 0.12;
      float bend = sin(p.x * 3.0 + t) * 0.15 + sin(p.y * 4.0 - t * 0.6) * 0.09;
      float2 mesh = float2(p.x + sin(p.y * 3.0 + t) * 0.16, p.y + bend);
      float2 grid = mesh * float2(32.0, 23.0);
      float2 distanceToLine = abs(fract(grid + 0.5) - 0.5);
      // Analytic screen-space gradients: RuntimeEffect does not expose dFdx/dFdy.
      float2 aa = float2(32.0 * (1.0 + abs(cos(p.y * 3.0 + t) * 0.48)),
        23.0 * (abs(cos(p.x * 3.0 + t) * 0.45) + abs(1.0 + cos(p.y * 4.0 - t * 0.6) * 0.36))) / resolution.y;
      float2 lines = 1.0 - smoothstep(aa * 0.3, aa * 1.15, distanceToLine);
      float line = max(lines.x, lines.y);
      float folds = 0.5 + 0.5 * sin(mesh.x * 5.0 + mesh.y * 3.0 + t);
      float3 color = mix(float3(0.07, 0.16, 0.23), float3(0.30, 0.43, 0.52), folds);
      return half4(color * line * edges(uv) * brightness, 1.0);
    }
  `;
export function Wireframe(props: AtmosphereProps) { return <Atmosphere {...props} source={wireframeSource} persistentBackground={false} />; }
