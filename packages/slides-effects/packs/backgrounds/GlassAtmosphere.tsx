import { atmosphereCommon } from "./common";
import { Atmosphere, type AtmosphereProps } from "./Atmosphere";
export const glassSource = atmosphereCommon + `
    uniform float effectIntensity;
    half4 main(float2 position) {
      float2 uv = position / resolution;
      float2 p = (uv - 0.5) * float2(resolution.x / resolution.y, 1.0);
      float t = time * 0.12;
      // A continuous glass sheet: analytic surface slopes bend a soft environment
      // reflection across the full viewport. No lens silhouettes or edge mask.
      float a = p.x * 2.7 + p.y * 1.4 + t * 0.45;
      float b = p.x * -1.3 + p.y * 3.2 - t * 0.35;
      float c = p.x * 4.1 - p.y * 2.4 + sin(t * 0.2) * 0.6;
      float height = sin(a) * 0.18 + sin(b) * 0.12 + sin(c) * 0.035;
      float2 slope = float2(
        cos(a) * 0.486 - cos(b) * 0.156 + cos(c) * 0.1435,
        cos(a) * 0.252 + cos(b) * 0.384 - cos(c) * 0.084);
      float2 refracted = p + slope * 0.65;
      float lightBand = refracted.y + refracted.x * 0.38 + height * 0.3;
      float facing = 0.65 + 0.35 * cos(a - b);
      float3 color = float3(0.006, 0.008, 0.012);
      // Narrow reflection crests with broader shoulders give the glass a readable
      // surface. The offset dark trough makes each fold feel refractive, not hazy.
      for (int i = 0; i < 3; i++) {
        float band = lightBand - (float(i) - 1.0) * 0.38;
        float crest = exp(-pow(band * 68.0, 2.0));
        float shoulder = exp(-pow((band + 0.018) * 19.0, 2.0));
        float trough = exp(-pow((band - 0.035) * 25.0, 2.0));
        float highlight = (crest * 0.19 + shoulder * 0.065) * facing;
        color += float3(0.70, 0.82, 0.96) * highlight * effectIntensity;
        color *= 1.0 - trough * 0.35;
      }
      return half4(color * brightness, 1.0);
    }
  `;
export function GlassAtmosphere(props: AtmosphereProps) { return <Atmosphere {...props} source={glassSource} persistentBackground={false} />; }
