import { graphInstances, orbInstances, prepareWorldScene, primitive, sampleWorldUniforms } from "../packs/world/scene";
import { tree, wave } from "../packs/world/graph";
import { buildWorldGraph } from "../packs/world/render";
import { benchmarkRenderGraph } from "./renderGraphBenchmark";

type Options = { width: number; height: number; quality: "low" | "medium" | "high"; frames?: number; repetitions?: number; warmup?: number };

export async function benchmarkWorld(options: Options) {
  const data = tree("root", Array.from({ length: 3 }, (_, branch) => [
    `branch-${branch}`,
    Array.from({ length: 3 }, (_, group) => [`group-${branch}-${group}`, Array.from({ length: 3 }, (_, leaf) => `leaf-${branch}-${group}-${leaf}`)]),
  ]) as Parameters<typeof tree>[1]);
  const scene = prepareWorldScene({
    quality: options.quality,
    camera: { shots: [{ at: 0, orbit: { center: [0, -0.5, 0], radius: 22, height: 8, speed: 0.06 }, fov: 42 }] },
    instances: [
      ...orbInstances({ count: 64, seed: 7, spread: [18, 9, 10], colors: ["#22d3ee", "#b56bff"], emissive: 5 }),
      ...graphInstances({ data, node: { color: "#b56bff", size: 0.27 }, edge: { color: "#22d3ee", curve: 0.4, glow: 2 }, activate: [wave({ from: "root", step: 1, speed: 0.35 })] }),
      primitive("ring", { size: 8, position: [0, -5, 0], color: "#22d3ee", emissive: 5 }),
    ],
    bloom: { intensity: 1.4, threshold: 1, radius: 0.8 }, fog: { density: 0.025, color: "#05060a" },
    vignette: 0.3, grain: 0.015, exposure: 1.1,
  });
  const result = await benchmarkRenderGraph({ ...options, definition: buildWorldGraph(scene),
    uniformsAt: seconds => sampleWorldUniforms(scene, { slideTime: seconds, stepTime: seconds, stepIndex: 1, stepOrigins: { 0: 0, 1: 0 } }) });
  return { ...result, workload: { quality: options.quality, orbs: 64, graphNodes: 40, graphEdges: 39, rings: 1,
    clock: "2 + frame / 60 seconds, step 1 at time zero; each repetition replays the same samples", seed: 7 } };
}

Object.assign(window, { benchmarkWorld });
