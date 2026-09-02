import { useSlideLifecycle } from "@legend-apps/presentation";
import {
  Root as TypeGPURoot,
  useBindGroup,
  useBuffer,
  useConfigureContext,
  useFrame,
  useRoot,
  useUniform,
} from "@typegpu/react";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas } from "react-native-webgpu";
import { d, std, tgpu } from "typegpu";

const canvasSize = 600;
const triangleAmount = 500;
const triangleSize = 0.08;

function rotate(v: any, angle: any) {
  "use gpu";
  return d.vec2f(
    v.x * std.cos(angle) - v.y * std.sin(angle),
    v.x * std.sin(angle) + v.y * std.cos(angle),
  );
}

function getRotationFromVelocity(velocity: any) {
  "use gpu";
  return -std.atan2(velocity.x, velocity.y);
}

const Boid = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const renderLayout = tgpu.bindGroupLayout({
  boids: { access: "readonly", storage: d.arrayOf(Boid) },
  colorPalette: { uniform: d.vec3f },
});

const triangleVertices = tgpu.const(d.arrayOf(d.vec2f), [
  d.vec2f(0, triangleSize),
  d.vec2f(-triangleSize / 2, -triangleSize / 2),
  d.vec2f(triangleSize / 2, -triangleSize / 2),
]);

function mainVert(input: any) {
  "use gpu";
  const boid: any = renderLayout.$.boids[input.$instanceIndex];
  const localPos: any = triangleVertices.$[input.$vertexIndex];
  const angle: any = getRotationFromVelocity(boid.velocity);
  const colorPalette: any = renderLayout.$.colorPalette;
  return {
    $position: d.vec4f(boid.position + rotate(localPos, angle), 0, 1),
    color: d.vec4f((std.sin(colorPalette + angle) * 0.45 + 0.45) as any, 1),
  };
}

function mainFrag(input: any) {
  "use gpu";
  return input.color;
}

const Params = d.struct({
  separationDistance: d.f32,
  separationStrength: d.f32,
  alignmentDistance: d.f32,
  alignmentStrength: d.f32,
  cohesionDistance: d.f32,
  cohesionStrength: d.f32,
});

const computeLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  boids: { access: "readonly", storage: d.arrayOf(Boid) },
  nextBoids: { access: "mutable", storage: d.arrayOf(Boid) },
});

function mainCompute(boidIndex: any) {
  "use gpu";
  const params: any = computeLayout.$.params;
  const currentBoid: any = computeLayout.$.boids[boidIndex];
  const nextBoid: any = computeLayout.$.nextBoids[boidIndex];

  let separation: any = d.vec2f();
  let alignment: any = d.vec2f();
  let cohesion: any = d.vec2f();
  let alignmentCount: any = d.u32(0);
  let cohesionCount: any = d.u32(0);

  for (let index: any = d.u32(0); index < computeLayout.$.boids.length; index++) {
    if (index === boidIndex) {
      continue;
    }
    const other: any = computeLayout.$.boids[index];
    const distance: any = std.distance(currentBoid.position, other.position);
    if (distance < params.separationDistance) {
      separation += currentBoid.position - other.position;
    }
    if (distance < params.alignmentDistance) {
      alignment += other.velocity;
      alignmentCount++;
    }
    if (distance < params.cohesionDistance) {
      cohesion += other.position;
      cohesionCount++;
    }
  }

  if (alignmentCount > 0) {
    alignment /= d.f32(alignmentCount);
  }
  if (cohesionCount > 0) {
    cohesion = cohesion / d.f32(cohesionCount) - currentBoid.position;
  }

  let newPosition: any = d.vec2f(currentBoid.position);
  let newVelocity: any = d.vec2f(currentBoid.velocity);
  newVelocity += separation * params.separationStrength
    + alignment * params.alignmentStrength
    + cohesion * params.cohesionStrength;
  newVelocity = std.normalize(newVelocity) * std.clamp(std.length(newVelocity), 0, 0.01);

  if (newPosition[0] > 1 + triangleSize) newPosition[0] = -1 - triangleSize;
  if (newPosition[1] > 1 + triangleSize) newPosition[1] = -1 - triangleSize;
  if (newPosition[0] < -1 - triangleSize) newPosition[0] = 1 + triangleSize;
  if (newPosition[1] < -1 - triangleSize) newPosition[1] = 1 + triangleSize;

  newPosition += newVelocity;
  nextBoid.position = d.vec2f(newPosition);
  nextBoid.velocity = d.vec2f(newVelocity);
}

const initialParams = {
  separationDistance: 0.05,
  separationStrength: 0.001,
  alignmentDistance: 0.3,
  alignmentStrength: 0.01,
  cohesionDistance: 0.3,
  cohesionStrength: 0.001,
};

function BoidsScene() {
  const { isActive, isPreview } = useSlideLifecycle();
  const root = useRoot();
  const previewRendered = useRef(false);
  const even = useRef(false);
  const paramsUniform = useUniform(Params, { initial: initialParams });
  const colorPaletteUniform = useUniform(d.vec3f, { initial: d.vec3f(0, 0.345, 0.867) });
  const initialData = useMemo(
    () => Array.from({ length: triangleAmount }, () => ({
      position: [Math.random() * 2 - 1, Math.random() * 2 - 1] as [number, number],
      velocity: [Math.random() * 0.1 - 0.05, Math.random() * 0.1 - 0.05] as [number, number],
    })),
    [],
  );
  const firstBoidBuffer = useBuffer(d.arrayOf(Boid, triangleAmount), { initial: initialData }).$usage("storage");
  const secondBoidBuffer = useBuffer(d.arrayOf(Boid, triangleAmount), { initial: initialData }).$usage("storage");
  const computePipeline = useMemo(() => root.createGuardedComputePipeline(mainCompute), [root]);
  const renderPipeline = useMemo(
    () => root.createRenderPipeline({ fragment: mainFrag, vertex: mainVert }),
    [root],
  );
  const firstComputeBindGroup = useBindGroup(computeLayout, {
    boids: firstBoidBuffer,
    nextBoids: secondBoidBuffer,
    params: paramsUniform.buffer,
  });
  const secondComputeBindGroup = useBindGroup(computeLayout, {
    boids: secondBoidBuffer,
    nextBoids: firstBoidBuffer,
    params: paramsUniform.buffer,
  });
  const firstRenderBindGroup = useBindGroup(renderLayout, {
    boids: firstBoidBuffer,
    colorPalette: colorPaletteUniform.buffer,
  });
  const secondRenderBindGroup = useBindGroup(renderLayout, {
    boids: secondBoidBuffer,
    colorPalette: colorPaletteUniform.buffer,
  });
  const { ctxRef, ref } = useConfigureContext({ alphaMode: "premultiplied" });

  useEffect(() => {
    previewRendered.current = false;
  }, [isActive, isPreview]);

  useFrame(() => {
    const context = ctxRef.current;
    if (!context || (!isActive && !isPreview) || (isPreview && previewRendered.current)) {
      return;
    }
    previewRendered.current = true;
    even.current = !even.current;
    computePipeline
      .with(even.current ? firstComputeBindGroup : secondComputeBindGroup)
      .dispatchThreads(triangleAmount);
    renderPipeline
      .withColorAttachment({ view: context })
      .with(even.current ? secondRenderBindGroup : firstRenderBindGroup)
      .draw(3, triangleAmount);
    context.present?.();
  });

  return <Canvas ref={ref} style={styles.canvas} transparent />;
}

export function TypeGPUBoids() {
  return (
    <View style={styles.container}>
      <TypeGPURoot disableWorklets>
        <BoidsScene />
      </TypeGPURoot>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height: canvasSize, width: canvasSize },
  container: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#efeff9",
    borderRadius: 28,
    height: canvasSize,
    justifyContent: "center",
    overflow: "hidden",
    width: canvasSize,
  },
});
