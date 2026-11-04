import { Background, GPURenderGraph, registerAdvanceGuard, PresentationCanvasScaleContext, PresentationObservableProvider, useBackgroundSize, usePlayback, usePresentation$, usePresentationValue, useRuntimeProjection } from "@legend-apps/presentation";
import { Children, Component, Fragment, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PixelRatio, View } from "react-native";
import { makeMutable, runOnJS, runOnUI, useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import type { CameraOptions, CameraPose } from "./camera";
import { buildWorldGraph, worldGraphTopology } from "./render";
import { sampleWorldClock, type CatchUp, type WorldClock } from "./timing";
import { advanceResolution, createResolutionState } from "./resolution";
import { tunnelInstances, type EnvironmentOptions, type KeyLightOptions, type TunnelOptions } from "./lighting";
import { renderTreeInstances, type RenderTreeOptions } from "./renderTree";
import { text3dInstances, type Text3DOptions } from "./text3d";
import { cardInstances, compileTrack, customInstances, graphInstances, labelInstance, orbInstances, prepareWorldScene, primitive, pulseInstances, rowInstances,
  sampleWorldCamera, sampleWorldUniforms, sdfInstance, sprayInstances, voxelInstances,
  type Animated, type CardOptions, type CustomOptions, type GraphOptions, type Instance, type LabelOptions, type LightOptions, type MaterialOptions, type OrbsOptions,
  type EffectOptions, type PostOptions, type PreparedWorldScene, type PrimitiveOptions, type PulseOptions, type RowsOptions, type SDFOptions, type SprayOptions, type StageMotion, type StageOptions, type VoxelsOptions, type WorldScene } from "./scene";
// motion.ts imports scene.ts; load scene first so its worklets capture motion's exports, not the cycle's undefined bindings.
import { burstInstances, choreographyInstances, type BurstOptions, type ChoreographyOptions } from "./motion";
import { pillarInstances, roundedBoxInstances, routedTubeInstances, type PillarOptions, type RoundedBoxOptions, type RoutedTubeOptions } from "./stage";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, type TrackFrame, type WorldTrack } from "./track";

export type { WorldCarry, WorldTrack } from "./track";

export { pillarInstances, roundedBoxInstances, routedTubeInstances } from "./stage";
export type { PillarOptions, RoundedBoxOptions, RoutedTubeOptions, TubePulse } from "./stage";
export { tree, wave, subset, layoutTree } from "./graph";
export { evaluateCamera, flyTo } from "./camera";
export { buildWorldGraph } from "./render";
export { cardInstances, orbInstances, graphInstances, labelInstance, primitive, prepareWorldScene, pulseInstances, recyclePathPoint, rowInstances, sprayInstances, voxelInstances, sampleWorldUniforms } from "./scene";
export type { Shot, CameraPose, Vec3 } from "./camera";
export type { RenderFlash, RenderTreeOptions } from "./renderTree";
export { layoutText3D, registerText3DFont, text3dInstances } from "./text3d";
export type { GlyphMotion, Text3DEnter, Text3DFont, Text3DOptions } from "./text3d";
export type { Animated, CardOptions, CardStyle, GraphOptions, LabelOptions, LabelWeight, RecycleOptions, RowLabel, OrbsOptions, PrimitiveOptions, WorldScene, MaterialOptions, LightOptions, PulseOptions, RowsOptions, VoxelsOptions } from "./scene";

export { burstInstances, choreographyInstances, partsFromInstances, railPoint, settleProgress } from "./motion";
export type { BurstOptions, BurstStyle, ChoreographyOptions, ChoreographyLayout, ChoreographyPart, ChoreographyTransition, PartPose, PartRoute } from "./motion";
export type { Instance } from "./scene";
export function Choreography(_: ChoreographyOptions) { return null; }
export function Burst(_: BurstOptions) { return null; }

export function Camera(_: CameraOptions) { return null; }
export function Graph(_: GraphOptions) { return null; }
export function Orbs(_: OrbsOptions) { return null; }
export function Sphere(_: PrimitiveOptions) { return null; }
export function Box(_: PrimitiveOptions) { return null; }
export function RoundedBox(_: RoundedBoxOptions) { return null; }
export function RoutedTube(_: RoutedTubeOptions) { return null; }
export function Pillar(_: PillarOptions) { return null; }
export function Tube(_: PrimitiveOptions) { return null; }
export function Ring(_: PrimitiveOptions & { radius?: Animated<number> }) { return null; }
export function Fog(_: NonNullable<WorldScene["fog"]>) { return null; }
export function Bloom(_: NonNullable<WorldScene["bloom"]>) { return null; }
export function Vignette(_: { amount?: Animated<number> }) { return null; }
export function Grain(_: { amount?: Animated<number> }) { return null; }
export function PathPulse(_: PulseOptions) { return null; }
export function Spray(_: SprayOptions) { return null; }
export function Rows(_: RowsOptions) { return null; }
export function Label(_: LabelOptions) { return null; }
export function Card(_: CardOptions) { return null; }
export function Voxels(_: VoxelsOptions) { return null; }
export function RenderTree(_: RenderTreeOptions) { return null; }
export function Text3D(_: Text3DOptions) { return null; }
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
/** Adds a `defineWorldEffect` effect: `<Effect use={glow({ gain: { 0: 0, 1: 1 } })} after="bloom" />`. */
export function Effect(_: EffectOptions) { return null; }
export { defineWorldEffect } from "./effects";
export type { WorldEffect, WorldEffectContext, WorldEffectGraph, WorldEffectPass, WorldEffectStage, WorldEffectTarget, WorldEffectUse } from "./effects";
export function Custom(_: CustomOptions) { return null; }
export function SDF(_: SDFOptions) { return null; }
export function KeyLight(_: KeyLightOptions) { return null; }
export function Environment(_: EnvironmentOptions) { return null; }
export function Tunnel(_: TunnelOptions) { return null; }
export { tunnelInstances } from "./lighting";
export type { EnvironmentOptions, FloorKerb, FloorLine, FloorMarkings, KeyLightOptions, TunnelOptions } from "./lighting";

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
  toneMapping?: WorldScene["toneMapping"]; outputColorSpace?: WorldScene["outputColorSpace"]; emissiveScale?: Animated<number>;
  quality?: WorldScene["quality"]; msaaSamples?: WorldScene["msaaSamples"]; exposure?: Animated<number>; previewTime?: number; borderRadius?: number;
  renderScale?: number;
  track?: WorldTrack;
  clock?: WorldClock;
  /** Added to the step index with `clock="step"`, so slides sharing one scene can address its tracks by a running step number. */
  stepOffset?: number;
  /** End time of this build, in seconds; enables early-advance settling and settled back steps. */
  buildDuration?: number; advanceDuration?: number; replayOnBack?: boolean;
  enter?: { from: "previous"; duration?: number }; scrim?: boolean | number; fallback?: ReactNode; active?: boolean;
  children?: ReactNode; accessibilityLabel?: string;
  postOrder?: WorldScene["postOrder"];
};
/** Each slide declares its own scene; the background host retains the named World surface. */
export function WorldSlide({ world, ...props }: Omit<WorldProps, "id" | "background"> & { world: string; track: WorldTrack }) {
  return <Background><World {...props} id={world} background /></Background>;
}
export function World(props: WorldProps) {
  const background = usePresentationValue("playbackScope") === "background";
  // id defines a continuity boundary; changing it creates a fresh sampled origin.
  const surface = <WorldSurface key={props.id ?? "world"} {...props} />;
  return background && props.clock !== "global" ? <WorldSlideClock>{surface}</WorldSlideClock> : surface;
}
function WorldSlideClock({ children }: { children: ReactNode }) {
  const sourceRuntime$ = usePresentation$();
  const runtime$ = useRuntimeProjection(() => ({ ...sourceRuntime$.get(), playbackScope: "slide" }), [sourceRuntime$]);
  return <PresentationObservableProvider value={runtime$}>{children}</PresentationObservableProvider>;
}
function worldContent(children: ReactNode, quality: WorldScene["quality"], msaaSamples: WorldScene["msaaSamples"], exposure: Animated<number>, backgroundColor: string, scrim: boolean | number, postOrder: WorldScene["postOrder"], toneMapping: WorldScene["toneMapping"], outputColorSpace: WorldScene["outputColorSpace"], emissiveScale: Animated<number>) {
  const scene: WorldScene = { instances: [], stages: [], materials: {}, lights: [], passes: [], effects: [], quality, msaaSamples, exposure, backgroundColor, postOrder, toneMapping, outputColorSpace, emissiveScale,
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
      else if (child.type === Choreography) add(choreographyInstances(options as ChoreographyOptions), stages);
      else if (child.type === Burst) add(burstInstances(options as BurstOptions), stages);
      else if (child.type === Camera) scene.camera = options as CameraOptions;
      else if (child.type === Graph) add(graphInstances(options as GraphOptions), stages);
      else if (child.type === Orbs) add(orbInstances(options), stages);
      else if (child.type === Sphere) add([primitive("sphere", options)], stages);
      else if (child.type === Box) add([primitive("box", options)], stages);
      else if (child.type === RoundedBox) add(roundedBoxInstances(options as RoundedBoxOptions), stages);
      else if (child.type === RoutedTube) add(routedTubeInstances(options as RoutedTubeOptions), stages);
      else if (child.type === Pillar) add(pillarInstances(options as PillarOptions), stages);
      else if (child.type === Tube) add([primitive("tube", options)], stages);
      else if (child.type === Ring) add([primitive("ring", { ...options, size: options.radius ?? options.size } as PrimitiveOptions)], stages);
      else if (child.type === PathPulse) add(pulseInstances(options as PulseOptions), stages);
      else if (child.type === Spray) add(sprayInstances(options), stages);
      else if (child.type === Rows) add(rowInstances(options as RowsOptions), stages);
      else if (child.type === Label) add([labelInstance(options as LabelOptions)], stages);
      else if (child.type === Card) add(cardInstances(options as CardOptions), stages);
      else if (child.type === Voxels) add(voxelInstances(options as VoxelsOptions), stages);
      else if (child.type === RenderTree) add(renderTreeInstances(options as RenderTreeOptions), stages);
      else if (child.type === Text3D) add(text3dInstances(options as Text3DOptions), stages);
      else if (child.type === Custom) add(customInstances(options as CustomOptions), stages);
      else if (child.type === SDF) add([sdfInstance(options as SDFOptions)], stages);
      else if (child.type === Material) { const material = options as MaterialOptions & { id: string }; scene.materials![material.id] = material; }
      else if (child.type === WorldCounter) scene.counter = options as NonNullable<WorldScene["counter"]>;
      else if (child.type === DOF) scene.dof = options;
      else if (child.type === Floor) scene.floor = options;
      else if (child.type === Shafts) scene.shafts = options;
      else if (child.type === Chromatic) scene.chromatic = options.amount as Animated<number> | undefined;
      else if (child.type === RimLight) scene.rim = options;
      else if (child.type === KeyLight) scene.keyLight = options;
      else if (child.type === Environment) scene.environment = options;
      else if (child.type === Tunnel) add(tunnelInstances(options), stages);
      else if (child.type === PointLight || child.type === SpotLight) scene.lights!.push({ ...options, kind: child.type === PointLight ? "point" : "spot" });
      else if (child.type === Pass) scene.passes!.push(options as PostOptions);
      else if (child.type === Effect) scene.effects!.push(options as EffectOptions);
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
  const { children, quality = "auto", msaaSamples, exposure = 1, backgroundColor = "#05060a", scrim = false, postOrder, toneMapping, outputColorSpace, emissiveScale = 1,
    width: configuredWidth = 1920, height: configuredHeight = 1080, background = false, borderRadius = 0, accessibilityLabel } = props;
  const size = useBackgroundSize();
  const width = background ? size.width : configuredWidth;
  const height = background ? size.height : configuredHeight;
  const { prepared, overlay } = useMemo(() => worldContent(children, quality, msaaSamples, exposure, backgroundColor, scrim, postOrder, toneMapping, outputColorSpace, emissiveScale), [children, quality, msaaSamples, exposure, backgroundColor, scrim, postOrder, toneMapping, outputColorSpace, emissiveScale]);
  const declared = useMemo(() => trackIds(prepared), [prepared]);
  // Retention depends on committed scene history, including objects absent from the new declaration.
  const [retained, setRetained] = useState({ input: prepared, scene: prepared });
  let trackScene = retained.scene;
  if (props.track && retained.input !== prepared) {
    trackScene = retainTrackScene(prepared, retained.scene);
    setRetained({ input: prepared, scene: trackScene });
  }
  const renderScene = props.track ? trackScene : prepared;
  // At two or more device pixels per slide unit the drawable already supersamples, so auto quality drops MSAA.
  const supersampled = PixelRatio.get() * useContext(PresentationCanvasScaleContext) >= 1.5;
  const topology = JSON.stringify({ ...worldGraphTopology(renderScene), supersampled });
  const [continuity] = useState(() => props.id ? retainedPose(props.id) : undefined);
  const origin = useSharedValue<{ key: string; pose: CameraPose | null }>({ key: "", pose: null });
  const resolution = useSharedValue(createResolutionState());
  const trackFrame = useSharedValue(createTrackFrame());
  return <View pointerEvents="box-none" accessibilityLabel={accessibilityLabel}
    style={{ width, height, borderRadius, overflow: "hidden", backgroundColor, ...(background ? { position: "absolute", left: 0, top: 0 } as const : {}) }}>
    <WorldSceneRuntime key={topology} {...props} width={width} height={height} prepared={renderScene} declared={declared} topology={topology}
      continuity={continuity} origin={origin} resolution={resolution} trackFrame={trackFrame} />
    {overlay.length > 0 && <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width, height }}>{overlay}</View>}
  </View>;
}
function WorldSceneRuntime({ width, height, background = false, quality = "auto",
  buildDuration, previewTime = buildDuration ?? 4, borderRadius = 0, renderScale = 1, clock: clockMode = "slide", stepOffset = 0, advanceDuration = 0.3, replayOnBack = false, enter, fallback, active = true, prepared, declared, topology, continuity, origin, resolution, track, trackFrame }:
  WorldProps & { width: number; height: number; prepared: PreparedWorldScene; declared: string[]; topology: string; continuity?: SharedValue<CameraPose | null>;
    origin: SharedValue<{ key: string; pose: CameraPose | null }>; resolution: SharedValue<ReturnType<typeof createResolutionState>>; trackFrame: SharedValue<TrackFrame> }) {
  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) throw new Error("World renderScale must be greater than zero and at most one");
  if (track && [track.spacing ?? 32, track.duration ?? 1.7].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error("World track values must be positive and finite");
  }
  if (track && [track.position, track.target, track.via, track.viaTarget].some(point => point && point.some(value => !Number.isFinite(value)))) {
    throw new Error("World track points must be finite");
  }
  // Each pipeline generation retains its own uniform SharedValue until UI retirement.
  const graph = useMemo(() => buildWorldGraph(JSON.parse(topology)), [topology]);
  // One UI copy of the baked scene shared by both worklets; capturing it in each closure copied it twice.
  const scene = useMemo(() => makeMutable(prepared), [prepared]);
  const ids = useMemo(() => trackIds(prepared), [prepared]);
  const playback = usePlayback();
  if (buildDuration !== undefined && (!Number.isFinite(buildDuration) || buildDuration < 0)) throw new Error("World buildDuration must be nonnegative");
  if (!Number.isFinite(advanceDuration) || advanceDuration < 0) throw new Error("World advanceDuration must be nonnegative");
  const phase = usePresentationValue("playbackPhase");
  const direction = usePresentationValue("direction");
  const catchUp = useSharedValue<CatchUp | null>(null);
  const requestId = useRef(0);
  const completion = useRef<{ request: number; resolve: () => void } | undefined>(undefined);
  const finish = useCallback((request: number) => {
    if (completion.current?.request === request) {
      const { resolve } = completion.current;
      completion.current = undefined;
      resolve();
    }
  }, []);
  const sampleClock = sampleWorldClock;
  const settledBack = direction === "backward" && !replayOnBack;
  useEffect(() => {
    if (!active || phase !== "playing" || buildDuration === undefined) return;
    const remove = registerAdvanceGuard(() => new Promise<void>(resolve => {
      const request = ++requestId.current;
      completion.current = { request, resolve };
      runOnUI(() => {
        "worklet";
        const state = playback.value;
        const clock = sampleClock(state, previewTime, clockMode, buildDuration, settledBack);
        const from = clockMode === "step" ? clock.stepTime : clock.slideTime;
        if (state.phase !== "playing" || from >= buildDuration || advanceDuration === 0) runOnJS(finish)(request);
        else catchUp.value = { request, key: `${state.slideKey}/${state.stepKey}`, start: state.slideTime, from, to: buildDuration };
      })();
    }));
    return () => { remove(); if (completion.current) finish(completion.current.request); };
  }, [active, phase, buildDuration, advanceDuration, playback, previewTime, clockMode, settledBack, catchUp, finish]);
  useAnimatedReaction(() => {
    "worklet";
    const state = playback.value, pending = catchUp.value;
    return pending && (pending.key !== `${state.slideKey}/${state.stepKey}` || state.slideTime - pending.start >= advanceDuration) ? pending.request : null;
  }, (request, previous) => { "worklet"; if (request !== null && request !== previous) runOnJS(finish)(request); }, [playback, catchUp, advanceDuration, finish]);
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
  const trackSampler = sampleTrackFrame;
  useAnimatedReaction(() => track && active ? { state: playback.value, scene: scene.value, scale: effectiveScale.value } : null, input => {
    "worklet";
    if (!track || !input || input.state.phase !== "playing") return;
    const { state, scene, scale } = input;
    const clock = sampleClock(state, previewTime, clockMode, buildDuration, settledBack, catchUp.value, advanceDuration, stepOffset);
    const values = sampleUniforms(scene, clock, null, 1, 1, track.frame === "world") as number[];
    values[35] = scale;
    const next = trackSampler(trackFrame.value, values, ids, state, track, declared);
    trackFrame.value = next;
  }, [playback, scene, effectiveScale, track, active, ids, declared, previewTime, clockMode, buildDuration, settledBack, catchUp, advanceDuration, stepOffset]);
  const enterDuration = enter?.duration ?? 1;
  const continuePrevious = enter?.from === "previous";
  const entryPose = continuePrevious && active && (phase === undefined || phase === "playing") ? continuity : undefined;
  useAnimatedReaction(() => playback.value, state => {
    "worklet";
    if (track || !continuity || !active || state.phase !== "playing") return;
    if (origin.value.key !== state.slideKey) origin.value = { key: state.slideKey, pose: continuePrevious ? continuity.value : null };
    const clock = sampleClock(state, previewTime, clockMode, buildDuration, settledBack, catchUp.value, advanceDuration);
    continuity.value = cameraEvaluator(scene.value, clock, origin.value.pose, enterDuration);
  }, [scene, playback, continuePrevious, enterDuration, previewTime, active, clockMode, buildDuration, settledBack, catchUp, advanceDuration, track]);
  const uniforms = useDerivedValue(() => {
    "worklet";
    const state = playback.value;
    const clock = sampleClock(state, previewTime, clockMode, buildDuration, settledBack, catchUp.value, advanceDuration, stepOffset);
    if (track) {
      if (state.phase === "preview" || state.phase === "preparing" || trackFrame.value.values.length === 0) {
        return trackSampler(createTrackFrame(), sampleUniforms(scene.value, clock, null, 1, 1, track.frame === "world") as number[], ids, state, track, declared).values;
      }
      return trackFrame.value.values;
    }
    const previous = state.phase === "preview" || state.phase === "preparing" ? null
      : origin.value.key === state.slideKey ? origin.value.pose : state.phase === "playing" ? entryPose?.value : null;
    return sampleUniforms(scene.value, clock, previous, enterDuration, effectiveScale.value, true);
  }, [scene, playback, previewTime, enterDuration, entryPose, effectiveScale, clockMode, buildDuration, settledBack, catchUp, advanceDuration, stepOffset, track, trackFrame, ids, declared]);
  return <WorldGPU fallback={fallback ?? null}>
    <GPURenderGraph {...graph} uniforms={uniforms} width={width} height={height} background={background}
      borderRadius={borderRadius} previewTime={previewTime} clock="slide" active={active} renderScale={effectiveScale} />
  </WorldGPU>;
}
