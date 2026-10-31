import { GPURenderGraph, PresentationCanvasScaleContext, PresentationObservableProvider, samplePlayback, useBackgroundSize, usePlayback, usePresentation$, usePresentationValue, useRuntimeProjection } from "@legend-apps/presentation";
import { Children, Component, Fragment, isValidElement, useContext, useMemo, useState, type ReactNode } from "react";
import { PixelRatio, View } from "react-native";
import { makeMutable, useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import type { CameraOptions, CameraPose } from "./camera";
import { buildWorldGraph, worldGraphTopology } from "./render";
import { advanceResolution, createResolutionState } from "./resolution";
import { compileTrack, customInstances, graphInstances, orbInstances, prepareWorldScene, primitive, pulseInstances, rowInstances,
  sampleWorldCamera, sampleWorldUniforms, sdfInstance, sprayInstances, voxelInstances,
  type Animated, type CustomOptions, type GraphOptions, type Instance, type LightOptions, type MaterialOptions, type OrbsOptions,
  type PostOptions, type PreparedWorldScene, type PrimitiveOptions, type PulseOptions, type RowsOptions, type SDFOptions, type SprayOptions, type StageMotion, type StageOptions, type VoxelsOptions, type WorldScene } from "./scene";

export { tree, wave, subset, layoutTree } from "./graph";
export { evaluateCamera, flyTo } from "./camera";
export { buildWorldGraph } from "./render";
export { orbInstances, graphInstances, primitive, prepareWorldScene, pulseInstances, rowInstances, sprayInstances, voxelInstances, sampleWorldUniforms } from "./scene";
export type { Shot, CameraPose, Vec3 } from "./camera";
export type { Animated, GraphOptions, OrbsOptions, PrimitiveOptions, WorldScene, MaterialOptions, LightOptions, PulseOptions, RowsOptions, VoxelsOptions } from "./scene";

export function Camera(_: CameraOptions) { return null; }
export function Graph(_: GraphOptions) { return null; }
export function Orbs(_: OrbsOptions) { return null; }
export function Sphere(_: PrimitiveOptions) { return null; }
export function Box(_: PrimitiveOptions) { return null; }
export function Tube(_: PrimitiveOptions) { return null; }
export function Ring(_: PrimitiveOptions & { radius?: Animated<number> }) { return null; }
export function Fog(_: NonNullable<WorldScene["fog"]>) { return null; }
export function Bloom(_: NonNullable<WorldScene["bloom"]>) { return null; }
export function Vignette(_: { amount?: Animated<number> }) { return null; }
export function Grain(_: { amount?: Animated<number> }) { return null; }
export function PathPulse(_: PulseOptions) { return null; }
export function Spray(_: SprayOptions) { return null; }
export function Rows(_: RowsOptions) { return null; }
export function Voxels(_: VoxelsOptions) { return null; }
export function Stage(_: StageOptions & { children?: ReactNode }) { return null; }
export function WorldCounter(_: NonNullable<WorldScene["counter"]>) { return null; }
export function DOF(_: NonNullable<WorldScene["dof"]>) { return null; }
export function Floor(_: NonNullable<WorldScene["floor"]>) { return null; }
export function Shafts(_: NonNullable<WorldScene["shafts"]>) { return null; }
export function Chromatic(_: { amount?: Animated<number> }) { return null; }
export function RimLight(_: NonNullable<WorldScene["rim"]>) { return null; }
export function PointLight(_: Omit<LightOptions, "kind">) { return null; }
export function SpotLight(_: Omit<LightOptions, "kind">) { return null; }
export function Material(_: MaterialOptions & { id: string }) { return null; }
export function Pass(_: PostOptions) { return null; }
export function Custom(_: CustomOptions) { return null; }
export function SDF(_: SDFOptions) { return null; }

const poses = new Map<string, SharedValue<CameraPose | null>>();
function retainedPose(id: string) {
  let pose = poses.get(id);
  if (!pose) { pose = makeMutable<CameraPose | null>(null); poses.set(id, pose); }
  return pose;
}

class WorldGPU extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn("World could not initialize WebGPU:", error.message); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export type WorldProps = {
  id?: string; width?: number; height?: number; background?: boolean; backgroundColor?: string;
  quality?: WorldScene["quality"]; exposure?: Animated<number>; previewTime?: number; borderRadius?: number;
  renderScale?: number;
  enter?: { from: "previous"; duration?: number }; scrim?: boolean | number; fallback?: ReactNode; active?: boolean;
  children?: ReactNode; accessibilityLabel?: string;
  postOrder?: WorldScene["postOrder"];
};
export function World(props: WorldProps) {
  const background = usePresentationValue("playbackScope") === "background";
  // id defines a continuity boundary; changing it creates a fresh sampled origin.
  const surface = <WorldSurface key={props.id ?? "world"} {...props} />;
  return background ? <WorldSlideClock>{surface}</WorldSlideClock> : surface;
}
function WorldSlideClock({ children }: { children: ReactNode }) {
  const sourceRuntime$ = usePresentation$();
  const runtime$ = useRuntimeProjection(() => ({ ...sourceRuntime$.get(), playbackScope: "slide" }), [sourceRuntime$]);
  return <PresentationObservableProvider value={runtime$}>{children}</PresentationObservableProvider>;
}
function worldContent(children: ReactNode, quality: WorldScene["quality"], exposure: Animated<number>, backgroundColor: string, scrim: boolean | number, postOrder: WorldScene["postOrder"]) {
  const scene: WorldScene = { instances: [], stages: [], materials: {}, lights: [], passes: [], quality, exposure, backgroundColor, postOrder,
    scrim: typeof scrim === "number" ? scrim : scrim ? 0.4 : 0 };
  const overlay: ReactNode[] = [];
  function add(instances: Instance[], stages: StageMotion[]) { for (const instance of instances) { if (stages.length) instance.stages = stages; scene.instances.push(instance); } }
  function collect(content: ReactNode, stages: StageMotion[] = []) {
    Children.forEach(content, child => {
      if (!isValidElement<Record<string, unknown>>(child)) {
        if (child && (typeof child !== "string" || child.trim())) overlay.push(child);
        return;
      }
      const options = child.props;
      if (child.type === Fragment) collect(options.children as ReactNode, stages);
      else if (child.type === Stage) {
        const stageOptions = options as StageOptions;
        if (scene.stages!.some(item => item.stage.id === stageOptions.id)) throw new Error(`World stage id is duplicated: ${stageOptions.id}`);
        const stage: StageMotion = { id: stageOptions.id, position: compileTrack(stageOptions.position ?? [0, 0, 0]), glow: compileTrack(stageOptions.glow ?? 1) };
        scene.stages!.push({ stage, parents: stages });
        collect(options.children as ReactNode, [...stages, stage]);
      }
      else if (child.type === Camera) scene.camera = options as CameraOptions;
      else if (child.type === Graph) add(graphInstances(options as GraphOptions), stages);
      else if (child.type === Orbs) add(orbInstances(options), stages);
      else if (child.type === Sphere) add([primitive("sphere", options)], stages);
      else if (child.type === Box) add([primitive("box", options)], stages);
      else if (child.type === Tube) add([primitive("tube", options)], stages);
      else if (child.type === Ring) add([primitive("ring", { ...options, size: options.radius ?? options.size } as PrimitiveOptions)], stages);
      else if (child.type === PathPulse) add(pulseInstances(options as PulseOptions), stages);
      else if (child.type === Spray) add(sprayInstances(options), stages);
      else if (child.type === Rows) add(rowInstances(options as RowsOptions), stages);
      else if (child.type === Voxels) add(voxelInstances(options as VoxelsOptions), stages);
      else if (child.type === Custom) add(customInstances(options as CustomOptions), stages);
      else if (child.type === SDF) add([sdfInstance(options as SDFOptions)], stages);
      else if (child.type === Material) { const material = options as MaterialOptions & { id: string }; scene.materials![material.id] = material; }
      else if (child.type === WorldCounter) scene.counter = options as NonNullable<WorldScene["counter"]>;
      else if (child.type === DOF) scene.dof = options;
      else if (child.type === Floor) scene.floor = options;
      else if (child.type === Shafts) scene.shafts = options;
      else if (child.type === Chromatic) scene.chromatic = options.amount as Animated<number> | undefined;
      else if (child.type === RimLight) scene.rim = options;
      else if (child.type === PointLight || child.type === SpotLight) scene.lights!.push({ ...options, kind: child.type === PointLight ? "point" : "spot" });
      else if (child.type === Pass) scene.passes!.push(options as PostOptions);
      else if (child.type === Fog) scene.fog = options;
      else if (child.type === Bloom) scene.bloom = options;
      else if (child.type === Vignette) scene.vignette = options.amount as Animated<number> | undefined;
      else if (child.type === Grain) scene.grain = options.amount as Animated<number> | undefined;
      else overlay.push(child);
    });
  }
  collect(children);
  return { prepared: prepareWorldScene(scene), overlay };
}
function WorldSurface(props: WorldProps) {
  const { children, quality = "auto", exposure = 1, backgroundColor = "#05060a", scrim = false, postOrder,
    width: configuredWidth = 1920, height: configuredHeight = 1080, background = false, borderRadius = 0, accessibilityLabel } = props;
  const size = useBackgroundSize();
  const width = background ? size.width : configuredWidth;
  const height = background ? size.height : configuredHeight;
  const { prepared, overlay } = useMemo(() => worldContent(children, quality, exposure, backgroundColor, scrim, postOrder), [children, quality, exposure, backgroundColor, scrim, postOrder]);
  // At 1.5 or more device pixels per slide unit the drawable already supersamples, so auto quality drops MSAA.
  const supersampled = PixelRatio.get() * useContext(PresentationCanvasScaleContext) >= 1.5;
  const topology = JSON.stringify({ ...worldGraphTopology(prepared), supersampled });
  const [continuity] = useState(() => props.id ? retainedPose(props.id) : undefined);
  const origin = useSharedValue<{ key: string; pose: CameraPose | null }>({ key: "", pose: null });
  const resolution = useSharedValue(createResolutionState());
  return <View pointerEvents="box-none" accessibilityLabel={accessibilityLabel}
    style={{ width, height, borderRadius, overflow: "hidden", backgroundColor, ...(background ? { position: "absolute", left: 0, top: 0 } as const : {}) }}>
    <WorldSceneRuntime key={topology} {...props} width={width} height={height} prepared={prepared} topology={topology}
      continuity={continuity} origin={origin} resolution={resolution} />
    {overlay.length > 0 && <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width, height }}>{overlay}</View>}
  </View>;
}
function WorldSceneRuntime({ width, height, background = false, quality = "auto",
  previewTime = 4, borderRadius = 0, renderScale = 1, enter, fallback, active = true, prepared, topology, continuity, origin, resolution }:
  WorldProps & { width: number; height: number; prepared: PreparedWorldScene; topology: string; continuity?: SharedValue<CameraPose | null>;
    origin: SharedValue<{ key: string; pose: CameraPose | null }>; resolution: SharedValue<ReturnType<typeof createResolutionState>> }) {
  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) throw new Error("World renderScale must be greater than zero and at most one");
  // Each pipeline generation retains its own uniform SharedValue until UI retirement.
  const graph = useMemo(() => buildWorldGraph(JSON.parse(topology)), [topology]);
  const playback = usePlayback();
  const sampleClock = samplePlayback;
  const cameraEvaluator = sampleWorldCamera;
  const sampleUniforms = sampleWorldUniforms;
  const resolutionEvaluator = advanceResolution;
  const adaptive = quality === "auto";
  const adaptivePlayback = adaptive ? playback : null;
  const scaleKey = `${width}:${height}:${renderScale}`;
  useAnimatedReaction(() => adaptivePlayback?.value ?? null, state => {
    "worklet";
    if (!state) return;
    resolution.value = resolutionEvaluator(resolution.value, { timestamp: state.lastTimestamp,
      playing: active && state.phase === "playing", key: `${state.slideKey}:${scaleKey}` });
  }, [adaptivePlayback, active, scaleKey]);
  const effectiveScale = useDerivedValue(() => {
    "worklet";
    const phase = adaptivePlayback?.value.phase;
    return renderScale * (phase && phase !== "preview" && phase !== "preparing" ? resolution.value.scale : 1);
  }, [renderScale, adaptivePlayback]);
  const enterDuration = enter?.duration ?? 1;
  const continuePrevious = enter?.from === "previous";
  const phase = usePresentationValue("playbackPhase");
  const entryPose = continuePrevious && active && (phase === undefined || phase === "playing") ? continuity : undefined;
  useAnimatedReaction(() => playback.value, state => {
    "worklet";
    if (!continuity || !active || state.phase !== "playing") return;
    if (origin.value.key !== state.slideKey) origin.value = { key: state.slideKey, pose: continuePrevious ? continuity.value : null };
    const clock = { ...state, slideTime: sampleClock(state, previewTime, "slide"), stepTime: sampleClock(state, previewTime, "step") };
    continuity.value = cameraEvaluator(prepared, clock, origin.value.pose, enterDuration);
  }, [prepared, continuePrevious, enterDuration, previewTime, active]);
  const uniforms = useDerivedValue(() => {
    "worklet";
    const state = playback.value;
    const clock = { ...state, slideTime: sampleClock(state, previewTime, "slide"), stepTime: sampleClock(state, previewTime, "step") };
    const previous = state.phase === "preview" || state.phase === "preparing" ? null
      : origin.value.key === state.slideKey ? origin.value.pose : state.phase === "playing" ? entryPose?.value : null;
    return sampleUniforms(prepared, clock, previous, enterDuration, effectiveScale.value, true);
  }, [prepared, previewTime, enterDuration, entryPose, effectiveScale]);
  return <WorldGPU fallback={fallback ?? null}>
    <GPURenderGraph {...graph} uniforms={uniforms} width={width} height={height} background={background}
      borderRadius={borderRadius} previewTime={previewTime} clock="slide" active={active} renderScale={effectiveScale} />
  </WorldGPU>;
}
