// @ts-nocheck Evaluate the actual shader worklet without a native renderer.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");
const source = readFileSync(`${import.meta.dir}/../Effect.tsx`, "utf8");
const code = transformSync(source.slice(source.indexOf("function EffectShader("), source.indexOf("function EffectCanvas(")), {loader: "tsx", format: "cjs", jsx: "automatic"}).code;
const jsx = (_, props) => props;
const Shader = new Function("require", "useValue", "isShared", "useDerivedValue", "RuntimeShader", "Blur", "Platform", code + ";return EffectShader;")(
  () => ({jsx}), fn => fn(), value => !!value && typeof value === "object" && "value" in value,
  fn => ({get value() { return fn(); }}), "shader", "blur", {OS: "macos"},
);
test("static glass does not read playback but still follows formation and blur", () => {
  let reads = 0;
  const uniforms = {value: {progress: 0}};
  const blur = {value: 0};
  const props = {blur, uniforms, animationEnabled: true, height: 100, width: 200, pixelRatio: 2, strength: 8,
    speed: 0, time: {get value() { reads++; return {time: 3}; }}};
  const shader = Shader(props);
  for (let frame = 0; frame < 120; frame++) expect(shader.uniforms.value.time).toBe(0);
  expect(reads).toBe(0);
  uniforms.value = {progress: 1}; blur.value = 24;
  expect(shader.uniforms.value.progress).toBe(1);
  expect(shader.children.blur.value).toBe(48);
  expect(Shader({...props, speed: 2}).uniforms.value.time).toBe(6);
  expect(reads).toBe(1);
  expect(Shader({...props, speed: 2, animationEnabled: false}).uniforms.value.time).toBe(0);
  expect(reads).toBe(1);
});
