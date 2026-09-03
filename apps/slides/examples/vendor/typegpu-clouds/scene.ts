import { defineTypeGPUScene } from "@legend-apps/presentation";
import { randf } from "@typegpu/noise";
import { common, d, std } from "typegpu";
import {
  FOV_FACTOR,
  NOISE_TEXTURE_SIZE,
  SKY_HORIZON,
  SKY_ZENITH_TINT,
  SUN_BRIGHTNESS,
  SUN_DIRECTION,
  SUN_GLOW,
  WIND_SPEED,
} from "./consts.ts";
import { CloudsParams, cloudsLayout } from "./types.ts";
import { raymarch } from "./utils.ts";

export const cloudScene = defineTypeGPUScene(({ format, root, size }) => {
  const paramsUniform = root.createUniform(CloudsParams, {
    time: 0,
    maxSteps: 50,
    maxDistance: 10.0,
  });
  const resolutionUniform = root.createUniform(d.vec2f, d.vec2f(size.width, size.height));

  const noiseData = new Uint8Array(NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE);
  for (let i = 0; i < noiseData.length; i += 1) {
    noiseData[i] = Math.random() * 255;
  }

  const sampler = root.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  const noiseTexture = root
    .createTexture({
      size: [NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE],
      format: "r8unorm",
    })
    .$usage("sampled", "render");
  noiseTexture.write(noiseData);

  const bindGroup = root.createBindGroup(cloudsLayout, {
    params: paramsUniform.buffer,
    noiseTexture,
    sampler,
  });

  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      "use gpu";
      randf.seed2(uv * cloudsLayout.$.params.time);
      const screenRes = resolutionUniform.$;
      const aspect = screenRes.x / screenRes.y;

      let screenPos = (uv - 0.5) * 2;
      screenPos = d.vec2f(screenPos.x * std.max(aspect, 1), screenPos.y * std.max(1 / aspect, 1));

      const sunDir = std.normalize(SUN_DIRECTION);
      const time = cloudsLayout.$.params.time;
      const rayOrigin = d.vec3f(
        std.sin(time * 0.6) * 0.5,
        std.cos(time * 0.8) * 0.5 - 1,
        time * WIND_SPEED,
      );
      const rayDir = std.normalize(d.vec3f(screenPos.x, screenPos.y, FOV_FACTOR));

      const sunDot = std.saturate(std.dot(rayDir, sunDir));
      const sunGlow = sunDot ** (1 / SUN_BRIGHTNESS ** 3);

      let skyCol = SKY_HORIZON - SKY_ZENITH_TINT * rayDir.y * 0.35;
      skyCol += SUN_GLOW * sunGlow;

      const cloudCol = raymarch(rayOrigin, rayDir, sunDir);
      const finalCol = skyCol * (1.1 - cloudCol.a) + cloudCol.rgb;

      return d.vec4f(finalCol, 1.0);
    },
    targets: { format },
  });

  return {
    render({ time, view }) {
      paramsUniform.patch({ time: time % 500 });
      pipeline
        .with(bindGroup)
        .withColorAttachment({
          view,
          clearValue: [0, 0, 0, 1],
        })
        .draw(3);
    },
  };
});
