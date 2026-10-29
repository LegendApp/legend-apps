import { customInstances, graphInstances, orbInstances, prepareWorldScene, primitive, pulseInstances, rowInstances, sampleWorldUniforms, sdfInstance, sprayInstances, voxelInstances, type WorldScene } from "../packs/world/scene";
import { tree, wave } from "../packs/world/graph";
import { buildWorldGraph } from "../packs/world/render";
import { advanceResolution, createResolutionState } from "../packs/world/resolution";
import { benchmarkRenderGraph, type BenchmarkOptions } from "./renderGraphBenchmark";

type Options = Omit<BenchmarkOptions, "definition" | "uniformsAt" | "renderScaleAt"> & { quality: NonNullable<WorldScene["quality"]>; allEffects?: boolean; renderScale?: number };

export async function benchmarkWorld(options: Options) {
  const data = tree("root", Array.from({ length: 3 }, (_, branch) => [
    `branch-${branch}`,
    Array.from({ length: 3 }, (_, group) => [`group-${branch}-${group}`, Array.from({ length: 3 }, (_, leaf) => `leaf-${branch}-${group}-${leaf}`)]),
  ]) as Parameters<typeof tree>[1]);
  const effectSamples = options.quality === "low" ? 8 : options.quality === "medium" ? 12 : 16;
  const effects: Partial<WorldScene> = options.allEffects ? {
    floor: { mirror: true, y: -5.5, roughness: 0.08, reflectivity: 0.8, size: 40, scale: 0.5 },
    dof: { focus: "bench-pulse", aperture: 0.75, maxBlur: 12, scale: 0.5, samples: effectSamples },
    shafts: { intensity: 0.6, density: 0.03, anisotropy: 0.3, scale: 0.25, samples: effectSamples }, chromatic: 0.0025,
    rim: { color: "#b56bff", intensity: 1.1 },
    lights: [
      { kind: "spot", position: [-4, 7, 3], target: [0, -4, 0], color: "#22d3ee", intensity: 18, range: 40, angle: 0.6 },
      { kind: "point", position: [5, 2, 2], color: "#b56bff", intensity: 8, range: 28 },
    ],
    counter: { source: "bench-voxels", position: [0.86, 0.14], size: 0.065, color: "#22d3ee" },
    passes: [{ after: "bloom", wgsl: `fn customPass(uv:vec2f,color:vec4f,ctx:PassContext)->vec4f {
      return vec4f(color.rgb*(.98+.02*sin(uv.y*800.+ctx.slideTime*.3)),color.a);
    }` }],
  } : {};
  const scene = prepareWorldScene({
    ...effects,
    quality: options.quality,
    camera: { shots: [{ at: 0, orbit: { center: [0, -0.5, 0], radius: 22, height: 8, speed: 0.06 }, fov: 42 }] },
    instances: [
      ...orbInstances({ count: 64, seed: 7, spread: [18, 9, 10], colors: ["#22d3ee", "#b56bff"], emissive: 5 }),
      ...graphInstances({ data, node: { color: "#b56bff", size: 0.27 }, edge: { color: "#22d3ee", curve: 0.4, glow: 2 }, activate: [wave({ from: "root", step: 1, speed: 0.35 })] }),
      primitive("ring", { size: 8, position: [0, -5, 0], color: "#22d3ee", emissive: 5 }),
      ...(options.allEffects ? [
        ...pulseInstances({ id: "bench-pulse", path: ["root", "branch-0", "group-0-0", "leaf-0-0-0"], step: 1, duration: 8, trail: 0.5, color: "#22d3ee", size: 0.12 }),
        ...sprayInstances({ id: "bench-spray", under: "leaves:lit", rate: 24, lifetime: 2, seed: 11, color: "#b56bff" }),
        ...rowInstances({ id: "bench-rows", count: 8, position: [-7, -1, 0], width: 2.4, spacing: 0.6, speed: 0.8, changes: [{ row: 2, step: 1 }] }),
        ...voxelInstances({ id: "bench-voxels", grid: [4, 4, 4], position: [7, -1, 0], spacing: 0.45, size: 0.18, color: "#b56bff", collapse: { step: 1, to: 0.2, duration: 6 } }),
        ...customInstances({ id: "bench-custom", count: 2, vertexCount: 6, position: [0, -1, 3], size: 0.5, wgsl: `
          fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
            let corners=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
            let p=corners[vid%6u];
            return ShapeVertex(vec3f(p.x+(f32(id)-.5)*3.,p.y+sin(ctx.slideTime)*.4,0.),vec3f(0.,0.,1.));
          }
          fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
            return Material(vec3f(.03,.3,.4),vec3f(.03,.7,.9)*2.,.4,.1);
          }` }),
        sdfInstance({ id: "bench-sdf", position: [-3, 0, 3], size: 0.7, color: "#22d3ee", bounds: [[-1, -1, -1], [1, 1, 1]], wgsl: "fn sdf(p:vec3f)->f32 { return length(p)-.7; }" }),
      ] : []),
    ],
    bloom: { intensity: 1.4, threshold: 1, radius: 0.8 }, fog: { density: 0.025, color: "#05060a" },
    vignette: 0.3, grain: 0.015, exposure: 1.1,
  });
  const adaptiveActive = options.quality === "auto" && options.paced === true;
  let resolution = createResolutionState();
  const result = await benchmarkRenderGraph({ ...options, definition: buildWorldGraph(scene),
    renderScaleAt: timestamp => {
      if (adaptiveActive) resolution = advanceResolution(resolution, { timestamp, playing: true, key: `${options.width}x${options.height}` });
      return (options.renderScale ?? 1) * (adaptiveActive ? resolution.scale : 1);
    },
    uniformsAt: (seconds, renderScale) => sampleWorldUniforms(scene, { slideTime: seconds, stepTime: seconds, stepIndex: 1, stepOrigins: { 0: 0, 1: 0 } }, undefined, 1, renderScale) });
  return { ...result, workload: { quality: options.quality, orbs: 64, graphNodes: 40, graphEdges: 39, rings: 1,
    allEffects: !!options.allEffects, instanceCount: scene.instances.length, adaptiveActive, manualRenderScale: options.renderScale ?? 1,
    effects: options.allEffects ? { reflection: { sceneScaleFactor: scene.floor?.scale }, dof: { sceneScaleFactor: scene.dof?.scale, samples: scene.dof?.samples },
      shafts: { sceneScaleFactor: scene.shafts?.scale, samples: scene.shafts?.samples }, chromatic: 0.0025, lights: 2,
      pulseInstances: 2, sprayParticles: 48, rows: 8, voxels: 64, customQuads: 2, sdfObjects: 1, customPost: true } : null,
    clock: "2 + frame / 60 seconds, step 1 at time zero; each repetition replays the same samples", seed: 7 } };
}

Object.assign(window, { benchmarkWorld });
