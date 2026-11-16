import { Background, RetainedSurface, GPURenderGraph, registerAdvanceGuard, PresentationCanvasScaleContext, PresentationObservableProvider, useBackgroundReady, useBackgroundSize, usePlayback, usePresentation$, usePresentationValue, useRuntimeProjection, useSurfaceSuspension } from "@legend-apps/presentation";
import { Children, Component, Fragment, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PixelRatio, View } from "react-native";
import { makeMutable, runOnJS, runOnUI, useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import type { CameraOptions, CameraPose } from "./camera";
import { buildJourneyGraph, journeyGraphTopology } from "./render";
import { prepareJourneyPlans, sampleJourneyPlan, journeyPlanCopies, journeyPlanFits, journeyPlanIds, type JourneyPlan } from "./plan";
import { sampleJourneyClock, type CatchUp, type JourneyClock } from "./timing";
import { advanceResolution, createResolutionState } from "./resolution";
import type { EnvironmentOptions, KeyLightOptions } from "./lighting";
import { renderTreeInstances, type RenderTreeOptions } from "./renderTree";
import { text3dInstances, type Text3DOptions } from "./text3d";
import { spriteInstance, type SpriteOptions } from "./sprite";
import { cardInstances, compileTrack, customInstances, graphInstances, labelInstance, orbInstances, prepareJourneySample, prepareJourneyScene, primitive, pulseInstances, rowInstances,
  sampleJourneyCamera, sampleJourneyUniforms, sdfInstance, sprayInstances, voxelInstances,
  type Animated, type CardOptions, type CustomOptions, type GraphOptions, type Instance, type LabelOptions, type LightOptions, type MaterialOptions, type OrbsOptions, type JourneySampleScene,
  type EffectOptions, type PostOptions, type PreparedJourneyScene, type PrimitiveOptions, type PulseOptions, type RowsOptions, type SDFOptions, type SprayOptions, type StageMotion, type StageOptions, type VoxelsOptions, type JourneyScene } from "./scene";
// motion.ts imports scene.ts; load scene first so its worklets capture motion's exports, not the cycle's undefined bindings.
import { burstInstances, choreographyInstances, type BurstOptions, type ChoreographyOptions } from "./motion";
import { pillarInstances, roundedBoxInstances, routedTubeInstances, type PillarOptions, type RoundedBoxOptions, type RoutedTubeOptions } from "./stage";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, type TrackFrame, type JourneyTrack } from "./track";

export type { JourneyCarry, JourneySegment, JourneyStepCamera, JourneyTrack } from "./track";

export { pillarInstances, roundedBoxInstances, routedTubeInstances } from "./stage";
export type { PillarOptions, RoundedBoxOptions, RoutedTubeOptions, TubePulse } from "./stage";
export { tree, wave, subset, layoutTree } from "./graph";
export { evaluateCamera, flyTo } from "./camera";
export { buildJourneyGraph } from "./render";
export { cardInstances, orbInstances, graphInstances, labelInstance, primitive, prepareJourneyScene, pulseInstances, recyclePathPoint, rowInstances, sprayInstances, voxelInstances, sampleJourneyUniforms } from "./scene";
export { contentClearance } from "./camera";
export { colorVector, compileTrack } from "./scene";
export type { Keyframe, Shading } from "./scene";
export { spriteInstance } from "./sprite";
export type { SpriteOptions } from "./sprite";
export type { Ease, Shot, CameraPose, Vec3 } from "./camera";
export type { RenderFlash, RenderTreeOptions } from "./renderTree";
export { layoutText3D, registerText3DFont, text3dInstances } from "./text3d";
export type { GlyphMotion, Text3DEnter, Text3DFont, Text3DOptions } from "./text3d";
export type { Animated, CardOptions, CardStyle, GraphOptions, LabelOptions, LabelWeight, RecycleOptions, RowLabel, OrbsOptions, PrimitiveOptions, JourneyScene, MaterialOptions, LightOptions, PulseOptions, RowsOptions, VoxelsOptions } from "./scene";

export { burstInstances, choreographyInstances, partsFromInstances, railPoint, settleProgress } from "./motion";
export type { BurstOptions, BurstStyle, ChoreographyOptions, ChoreographyLayout, ChoreographyPart, ChoreographyTransition, PartPose, PartRoute } from "./motion";
export type { Instance } from "./scene";
export function Choreography(_: ChoreographyOptions) { return null; }
export function Burst(_: BurstOptions) { return null; }

type SceneComponent<P> = ((props: P) => null) & { expandScene: (props: P) => ReactNode };
/** Pure declaration macros expand during scene preparation, before sampling on the UI thread. */
export function defineSceneComponent<P>(expand: (props: P) => ReactNode): SceneComponent<P> {
  return Object.assign((_: P) => null, { expandScene: expand });
}
/** Prepared instances retain their tracks, geometry identity and containing Stage transforms. */
export function Instances(_: { items: Instance[] }) { return null; }

export function Camera(_: CameraOptions) { return null; }
export function Graph(_: GraphOptions) { return null; }
export function Orbs(_: OrbsOptions) { return null; }
export function Sphere(_: PrimitiveOptions) { return null; }
export function Box(_: PrimitiveOptions) { return null; }
export function Sprite(_: SpriteOptions) { return null; }
export function RoundedBox(_: RoundedBoxOptions) { return null; }
export function RoutedTube(_: RoutedTubeOptions) { return null; }
export function Pillar(_: PillarOptions) { return null; }
export function Tube(_: PrimitiveOptions) { return null; }
export function Ring(_: PrimitiveOptions & { radius?: Animated<number> }) { return null; }
export function Fog(_: NonNullable<JourneyScene["fog"]>) { return null; }
export function Bloom(_: NonNullable<JourneyScene["bloom"]>) { return null; }
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
export function JourneyCounter(_: NonNullable<JourneyScene["counter"]>) { return null; }
export function DOF(_: NonNullable<JourneyScene["dof"]>) { return null; }
export function Floor(_: NonNullable<JourneyScene["floor"]>) { return null; }
export function Shafts(_: NonNullable<JourneyScene["shafts"]>) { return null; }
export function Chromatic(_: { amount?: Animated<number> }) { return null; }
export function RimLight(_: NonNullable<JourneyScene["rim"]>) { return null; }
export function PointLight(_: Omit<LightOptions, "kind">) { return null; }
export function SpotLight(_: Omit<LightOptions, "kind">) { return null; }
export function Material(_: MaterialOptions & { id: string }) { return null; }
export function Pass(_: PostOptions) { return null; }
/** Adds a `defineJourneyEffect` effect: `<Effect use={glow({ gain: { 0: 0, 1: 1 } })} after="bloom" />`. */
export function Effect(_: EffectOptions) { return null; }
export { defineJourneyEffect } from "./effects";
export { hazeEffect as haze } from "./post";
export type { JourneyEffect, JourneyEffectContext, JourneyEffectGraph, JourneyEffectPass, JourneyEffectStage, JourneyEffectTarget, JourneyEffectUse } from "./effects";
export function Custom(_: CustomOptions) { return null; }
export function SDF(_: SDFOptions) { return null; }
export function KeyLight(_: KeyLightOptions) { return null; }
export function Environment(_: EnvironmentOptions) { return null; }
export type { EnvironmentOptions, FloorSurface, KeyLightOptions } from "./lighting";

const poses = new Map<string, SharedValue<CameraPose | null>>();
// Sampled scenes are read-only on UI, so every surface of one prepared scene shares a single UI copy.
const scenes = new WeakMap<PreparedJourneyScene, SharedValue<JourneySampleScene>>();
function sharedScene(prepared: PreparedJourneyScene) {
  let scene = scenes.get(prepared);
  if (!scene) { scene = makeMutable(prepareJourneySample(prepared)); scenes.set(prepared, scene); }
  return scene;
}
function unpackScene(scene: SharedValue<JourneySampleScene>) {
  "worklet";
  void scene.value;
}
function retainedPose(id: string) {
  let pose = poses.get(id);
  if (!pose) { pose = makeMutable<CameraPose | null>(null); poses.set(id, pose); }
  return pose;
}

class JourneyGPU extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn("Journey could not initialize WebGPU:", error.message); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export type JourneyProps = {
  scenePlan?: { content: ReturnType<typeof journeyContent>; pool?: JourneyPlan };
  id?: string; width?: number; height?: number; background?: boolean; backgroundColor?: string;
  toneMapping?: JourneyScene["toneMapping"]; outputColorSpace?: JourneyScene["outputColorSpace"]; emissiveScale?: Animated<number>;
  quality?: JourneyScene["quality"]; msaaSamples?: JourneyScene["msaaSamples"]; exposure?: Animated<number>; previewTime?: number; borderRadius?: number;
  renderScale?: number;
  track?: JourneyTrack;
  clock?: JourneyClock;
  /** Added to the step index with `clock="step"`, so slides sharing one scene can address its tracks by a running step number.
   * On a `JourneyStop`, `"auto"` adds the steps of the journey's earlier slides, from the deck's step counts. */
  stepOffset?: number | "auto";
  /** Duration in seconds of keyframes that set none (default 0.65); `"flight"` uses the track's flight `duration`, so parts keep pace with the camera. */
  keyframeDuration?: number | "flight";
  /** `"cartoon"`: neutral tone mapping, no vignette, grain or rim, toon shading on every shape and softer key shadows. Explicit props still win. */
  look?: "cartoon";
  /** End time of this build, in seconds, for settled back steps and optional early-advance settling. */
  buildDuration?: number;
  /** Seconds to finish an early build before Next; zero (default) navigates immediately. */
  advanceDuration?: number; replayOnBack?: boolean;
  enter?: { from: "previous"; duration?: number }; scrim?: boolean | number; fallback?: ReactNode; active?: boolean;
  children?: ReactNode; accessibilityLabel?: string;
  postOrder?: JourneyScene["postOrder"];
};
/** Each slide declares its own scene; the background host retains the named Journey surface. */
export function JourneyStop({ journey, stepOffset, ...props }: Omit<JourneyProps, "id" | "background"> & { journey: string; track: JourneyTrack }) {
  const offset = useJourneyStepOffset(journey, stepOffset);
  return <Background><Journey {...props} stepOffset={offset} id={journey} background /></Background>;
}
const journeySlides = new Map<string, Set<number>>();
/** Slides a journey's stops have rendered on. Stops are assumed consecutive: slides between two known stops count too. */
function useJourneyStepOffset(journey: string, stepOffset: JourneyProps["stepOffset"]) {
  const slideIndex = usePresentationValue("slideIndex"), counts = usePresentationValue("slideStepCounts");
  if (stepOffset !== "auto") return stepOffset;
  let slides = journeySlides.get(journey);
  if (!slides) journeySlides.set(journey, slides = new Set());
  slides.add(slideIndex);
  return journeyStepOffset(slides, slideIndex, counts);
}
export function journeyStepOffset(slides: Iterable<number>, slideIndex: number, counts: number[] | undefined) {
  let first = slideIndex;
  for (const slide of slides) if (slide < first) first = slide;
  let offset = 0;
  for (let slide = first; slide < slideIndex; slide++) offset += counts?.[slide] ?? 1;
  return offset;
}
export function Journey(props: JourneyProps) {
  const background = usePresentationValue("playbackScope") === "background";
  // id defines a continuity boundary; changing it creates a fresh sampled origin.
  const surface = <JourneySurface key={props.id ?? "journey"} {...props} />;
  return background && props.clock !== "global" ? <JourneySlideClock>{surface}</JourneySlideClock> : surface;
}
/** Bakes a prepared slide's scene in idle time, so activation reuses its content and UI scene. */
Journey.prepareBackground = (props: JourneyProps) => {
  if (props.scenePlan) return;
  const { prepared } = declaredContent(props);
  // Track surfaces sample a retained scene that depends on the previous slide.
  if (!props.track) runOnUI(unpackScene)(sharedScene(prepared));
};
function JourneySlideClock({ children }: { children: ReactNode }) {
  const sourceRuntime$ = usePresentation$();
  const ready = useBackgroundReady();
  const runtime$ = useRuntimeProjection(() => {
    const source = sourceRuntime$.get(), preparing = !ready && !source.isPreview;
    return { ...source, playbackScope: "slide", isActive: source.isActive && !preparing, isPreparing: preparing,
      playbackPhase: preparing ? "preparing" : source.playbackPhase };
  }, [sourceRuntime$, ready]);
  return <PresentationObservableProvider value={runtime$}>{children}</PresentationObservableProvider>;
}
type JourneyContent = { prepared: PreparedJourneyScene; overlay: ReactNode[] };
type CachedContent = { children: ReactNode; options: unknown[]; content: JourneyContent };
const journeyContents = new WeakMap<object, CachedContent>();
// Slides re-create their declaration elements when they activate; equal declarations reuse the prepared scene.
const recentContents: CachedContent[] = [];
const recentContentLimit = 16;
function sameDeclaration(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((value, i) => sameDeclaration(value, b[i]));
  if (isValidElement(a)) return isValidElement(b) && a.type === b.type && a.key === b.key && sameDeclaration(a.props, b.props);
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameDeclaration((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
function journeyContent(children: ReactNode, quality: JourneyScene["quality"], msaaSamples: JourneyScene["msaaSamples"], exposure: Animated<number>, backgroundColor: string, scrim: boolean | number, postOrder: JourneyScene["postOrder"], toneMapping: JourneyScene["toneMapping"], outputColorSpace: JourneyScene["outputColorSpace"], emissiveScale: Animated<number>,
  look?: JourneyProps["look"], keyframeDuration?: number): JourneyContent {
  // Prepared scene declarations are shared by presenter, audience and neighbor surfaces.
  const key = children !== null && typeof children === "object" ? children : undefined;
  const options = [quality, msaaSamples, exposure, backgroundColor, scrim, postOrder, toneMapping, outputColorSpace, emissiveScale, look, keyframeDuration];
  let cached = key && journeyContents.get(key);
  if (key && !(cached && sameDeclaration(options, cached.options))) {
    cached = recentContents.find(entry => sameDeclaration(options, entry.options) && sameDeclaration(children, entry.children));
    if (cached) journeyContents.set(key, cached);
  }
  if (cached) return cached.content;
  const scene: JourneyScene = { instances: [], stages: [], materials: {}, lights: [], passes: [], effects: [], quality, msaaSamples, exposure, backgroundColor, postOrder, toneMapping: toneMapping ?? (look === "cartoon" ? "neutral" : undefined), outputColorSpace, emissiveScale,
    look, keyframeDuration, scrim: typeof scrim === "number" ? scrim : scrim ? 0.4 : 0 };
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
        if (scene.stages!.some(item => item.stage.id === stageOptions.id)) throw new Error(`Journey stage id is duplicated: ${stageOptions.id}`);
        const stage: StageMotion = { id: stageOptions.id, position: compileTrack(stageOptions.position ?? [0, 0, 0]), glow: compileTrack(stageOptions.glow ?? 1),
          opacity: stageOptions.opacity === undefined ? undefined : compileTrack(stageOptions.opacity), wave: stageOptions.wave, sharp: stageOptions.sharp === undefined ? undefined : compileTrack(stageOptions.sharp, Number) };
        scene.stages!.push({ stage, parents: stages });
        collect(options.children as ReactNode, [...stages, stage]);
      }
      else if (child.type === Instances) add((options.items as Instance[]).map(instance => ({ ...instance })), stages);
      else if (typeof child.type === "function" && "expandScene" in child.type) collect((child.type as SceneComponent<Record<string, unknown>>).expandScene(options), stages);
      else if (child.type === Choreography) add(choreographyInstances(options as ChoreographyOptions), stages);
      else if (child.type === Burst) add(burstInstances(options as BurstOptions), stages);
      else if (child.type === Camera) scene.camera = options as CameraOptions;
      else if (child.type === Graph) add(graphInstances(options as GraphOptions), stages);
      else if (child.type === Orbs) add(orbInstances(options), stages);
      else if (child.type === Sphere) add([primitive("sphere", options)], stages);
      else if (child.type === Box) add([primitive("box", options)], stages);
      else if (child.type === Sprite) add([spriteInstance(options as SpriteOptions)], stages);
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
      else if (child.type === JourneyCounter) scene.counter = options as NonNullable<JourneyScene["counter"]>;
      else if (child.type === DOF) scene.dof = options;
      else if (child.type === Floor) scene.floor = options;
      else if (child.type === Shafts) scene.shafts = options;
      else if (child.type === Chromatic) scene.chromatic = options.amount as Animated<number> | undefined;
      else if (child.type === RimLight) scene.rim = options;
      else if (child.type === KeyLight) scene.keyLight = options;
      else if (child.type === Environment) scene.environment = options;
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
  const content = { prepared: prepareJourneyScene(scene), overlay };
  if (key) {
    const entry = { children, options, content };
    journeyContents.set(key, entry);
    if (recentContents.unshift(entry) > recentContentLimit) recentContents.pop();
  }
  return content;
}
function declaredContent(props: JourneyProps) {
  return journeyContent(props.children, props.quality ?? "auto", props.msaaSamples, props.exposure ?? 1,
    props.backgroundColor ?? "#05060a", props.scrim ?? false, props.postOrder, props.toneMapping, props.outputColorSpace, props.emissiveScale ?? 1, props.look, keyframeSeconds(props));
}
function keyframeSeconds({ keyframeDuration, track }: JourneyProps) {
  return keyframeDuration === "flight" ? track?.duration ?? 1.7 : keyframeDuration;
}
/** Bake declarations and one compatible GPU layout before navigation starts. */
export function prepareJourneyStops(slides: JourneyProps[]): JourneyProps[] {
  const contents = slides.map(declaredContent);
  const pools = prepareJourneyPlans(contents.map(content => content.prepared));
  return slides.map((props, i) => ({ ...props, scenePlan: { content: contents[i], pool: props.track?.frame === "world" ? undefined : pools.get(contents[i].prepared) } }));
}
function JourneySurface(props: JourneyProps) {
  const { children, quality = "auto", msaaSamples, exposure = 1, backgroundColor = "#05060a", scrim = false, postOrder, toneMapping, outputColorSpace, emissiveScale = 1,
    width: configuredWidth = 1920, height: configuredHeight = 1080, background = false, borderRadius = 0, accessibilityLabel } = props;
  const size = useBackgroundSize();
  const width = background ? size.width : configuredWidth;
  const height = background ? size.height : configuredHeight;
  const { prepared, overlay } = useMemo(() => props.scenePlan?.content ?? journeyContent(children, quality, msaaSamples, exposure, backgroundColor, scrim, postOrder, toneMapping, outputColorSpace, emissiveScale, props.look, keyframeSeconds(props)), [props.scenePlan, children, quality, msaaSamples, exposure, backgroundColor, scrim, postOrder, toneMapping, outputColorSpace, emissiveScale, props.look, props.keyframeDuration, props.track?.duration]);
  const declared = useMemo(() => trackIds(prepared), [prepared]);
  const preview = usePresentationValue("isPreview");
  const requestedPool = preview ? undefined : props.scenePlan?.pool;
  const liveIds = useRef({ ids: [] as string[], slide: -1 });
  const retainLiveIds = useCallback((ids: string[], slide: number) => { liveIds.current = { ids, slide }; }, []);
  const slide = usePresentationValue("slideIndex");
  // Repeated declarations reuse the same departure; older live parts survive rapid navigation.
  const [retained, setRetained] = useState({ slide, input: prepared, scene: prepared, previous: prepared, previousInput: prepared,
    live: [] as string[], visibilityCurrent: false, pool: requestedPool, sourcePool: requestedPool });
  let trackScene = retained.scene, pool = props.track ? retained.pool : requestedPool;
  if (props.track && (retained.slide !== slide || retained.input !== prepared)) {
    const previous = retained.slide === slide ? retained.previous : retained.scene;
    const previousInput = retained.slide === slide ? retained.previousInput : retained.input;
    const live = retained.slide === slide ? retained.live : liveIds.current.ids;
    const visibilityCurrent = retained.slide === slide ? retained.visibilityCurrent : liveIds.current.slide === retained.slide;
    pool = JSON.stringify(retained.sourcePool?.topology) === JSON.stringify(requestedPool?.topology) ? retained.pool ?? requestedPool : undefined;
    trackScene = retainTrackScene(prepared, previous, previousInput, !!pool, live, visibilityCurrent);
    if (pool && !journeyPlanFits(trackScene, pool)) {
      pool = undefined;
      trackScene = retainTrackScene(prepared, previous, previousInput, false, live, visibilityCurrent);
    }
    setRetained({ slide, input: prepared, scene: trackScene, previous, previousInput, live, visibilityCurrent, pool, sourcePool: requestedPool });
  }
  const renderScene = props.track ? trackScene : prepared;
  // At two or more device pixels per slide unit the drawable already supersamples, so auto quality drops MSAA.
  const supersampled = PixelRatio.get() * useContext(PresentationCanvasScaleContext) >= 1.5;
  const topology = JSON.stringify({ ...(pool?.topology ?? journeyGraphTopology(renderScene)), supersampled });
  const [continuity] = useState(() => props.id ? retainedPose(props.id) : undefined);
  const origin = useSharedValue<{ key: string; pose: CameraPose | null }>({ key: "", pose: null });
  const resolution = useSharedValue(createResolutionState());
  const trackFrame = useSharedValue(createTrackFrame());
  // React's dev prop tracing must not enumerate the prepared uniform buffers.
  const content = useMemo(() => ({ prepared: pool ? prepared : renderScene, retained: renderScene, declared }), [pool, prepared, renderScene, declared]);
  return <View pointerEvents="box-none" accessibilityLabel={accessibilityLabel}
    style={{ width, height, borderRadius, overflow: "hidden", backgroundColor, ...(background ? { position: "absolute", left: 0, top: 0 } as const : {}) }}>
    <RetainedSurface identity={topology}><JourneySceneRuntime key={topology} {...props} width={width} height={height} content={content} topology={topology}
      pool={pool} continuity={continuity} origin={origin} resolution={resolution} trackFrame={trackFrame} retainLiveIds={retainLiveIds} /></RetainedSurface>
    {overlay.length > 0 && <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width, height }}>{overlay}</View>}
  </View>;
}
function JourneySceneRuntime({ width, height, background = false, quality = "auto",
  buildDuration, previewTime = buildDuration ?? 4, borderRadius = 0, renderScale = 1, clock: clockMode = "slide", stepOffset: requestedStepOffset = 0, advanceDuration = 0, replayOnBack = false, enter, fallback, active: requestedActive = true, content: { prepared, retained, declared }, topology, pool, continuity, origin, resolution, track, trackFrame, retainLiveIds }:
  JourneyProps & { width: number; height: number; content: { prepared: PreparedJourneyScene; retained: PreparedJourneyScene; declared: string[] }; topology: string; pool?: JourneyPlan; continuity?: SharedValue<CameraPose | null>;
    origin: SharedValue<{ key: string; pose: CameraPose | null }>; resolution: SharedValue<ReturnType<typeof createResolutionState>>; trackFrame: SharedValue<TrackFrame>; retainLiveIds: (ids: string[], slide: number) => void }) {
  if (requestedStepOffset === "auto") throw new Error('Journey stepOffset="auto" needs a JourneyStop');
  const stepOffset = requestedStepOffset;
  const suspension = useSurfaceSuspension();
  const suspendedOnUI = suspension?.signal;
  const active = requestedActive && !suspension?.suspended;
  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) throw new Error("Journey renderScale must be greater than zero and at most one");
  if (track && [track.spacing ?? 32, track.duration ?? 1.7].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Journey track values must be positive and finite");
  }
  if (track && [track.position, track.target, track.via, track.viaTarget].some(point => point && point.some(value => !Number.isFinite(value)))) {
    throw new Error("Journey track points must be finite");
  }
  if (track && [track, ...track.course ?? []].some(leg => leg && (leg.turn !== undefined && !(Math.abs(leg.turn) <= 60) || leg.rise !== undefined && !Number.isFinite(leg.rise) ||
    leg.bank !== undefined && !(leg.bank >= 0 && leg.bank <= 45) || [leg.spacing, leg.duration].some(value => value !== undefined && !(value > 0 && Number.isFinite(value)))))) {
    throw new Error("Journey track turn must be within ±60 degrees, bank 0–45 degrees, rise finite, and spacing and duration positive");
  }
  if (track?.advance && [track, ...track.course ?? []].some(leg => leg?.turn)) throw new Error("Journey track turns need the default advance direction");
  // Each pipeline generation retains its own uniform SharedValue until UI retirement.
  const graph = useMemo(() => buildJourneyGraph(JSON.parse(topology)), [topology]);
  // Prepared scenes are immutable; each surface keeps its own sampled output and track state.
  const scene = useMemo(() => sharedScene(prepared), [prepared]);
  const uniformCache = useSharedValue(0);
  const ids = useMemo(() => pool ? journeyPlanIds(retained, pool) : trackIds(prepared), [prepared, retained, pool]);
  const sampleIds = useMemo(() => trackIds(prepared), [prepared]);
  const copies = useMemo(() => pool ? journeyPlanCopies(prepared, pool) : [], [prepared, pool]);
  const pooledOutput = useMemo(() => makeMutable(new Float32Array(pool?.size ?? 0)), [pool]);
  const pooled = !!pool;
  const lightOffset = pool?.lightOffset ?? 0;
  const planSampler = sampleJourneyPlan;
  const playback = usePlayback();
  if (buildDuration !== undefined && (!Number.isFinite(buildDuration) || buildDuration < 0)) throw new Error("Journey buildDuration must be nonnegative");
  if (!Number.isFinite(advanceDuration) || advanceDuration < 0) throw new Error("Journey advanceDuration must be nonnegative");
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
  const sampleClock = sampleJourneyClock;
  const settledBack = direction === "backward" && !replayOnBack;
  useEffect(() => {
    if (!active || phase !== "playing" || buildDuration === undefined || advanceDuration === 0) return;
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
  }, (request, previous) => { "worklet"; if (request !== null && request !== previous) runOnJS(finish)(request); });
  const cameraEvaluator = sampleJourneyCamera;
  const sampleUniforms = sampleJourneyUniforms;
  const resolutionEvaluator = advanceResolution;
  const adaptive = quality === "auto";
  const adaptivePlayback = adaptive ? playback : null;
  const scaleKey = `${width}:${height}:${renderScale}`;
  useAnimatedReaction(() => adaptivePlayback?.value ?? null, state => {
    "worklet";
    if (!state || suspendedOnUI?.get()) return;
    resolution.value = resolutionEvaluator(resolution.value, { timestamp: state.lastTimestamp,
      playing: active && state.phase === "playing", key: `${state.slideKey}:${scaleKey}` });
  });
  const effectiveScale = useDerivedValue(() => {
    "worklet";
    const phase = adaptivePlayback?.value.phase;
    return renderScale * (phase && phase !== "preview" && phase !== "preparing" ? resolution.value.scale : 1);
  });
  const trackSampler = sampleTrackFrame;
  useAnimatedReaction(() => track && active && !suspendedOnUI?.get() ? { state: playback.value, scene: scene.value, scale: effectiveScale.value } : null, input => {
    "worklet";
    if (suspendedOnUI?.get() || !track || !input || input.state.phase !== "playing") return;
    const { state, scene, scale } = input;
    const clock = sampleClock(state, previewTime, clockMode, buildDuration, settledBack, catchUp.value, advanceDuration, stepOffset);
    const sampled = sampleUniforms(scene, clock, null, 1, 1, uniformCache);
    const values = (pooled ? planSampler(sampled, copies, pooledOutput.value, lightOffset) : sampled) as number[];
    values[35] = scale;
    const previous = trackFrame.value;
    const next = trackSampler(previous, values, ids, state, track, declared, { scene, clock, ids: sampleIds });
    trackFrame.value = next;
    if (previous.visible !== next.visible || previous.slideKey !== next.slideKey) runOnJS(retainLiveIds)(next.visible, Number(next.slideKey.split(":")[0]));
  });
  const enterDuration = enter?.duration ?? 1;
  const continuePrevious = enter?.from === "previous";
  const entryPose = continuePrevious && active && (phase === undefined || phase === "playing" || phase === "preparing") ? continuity : undefined;
  useAnimatedReaction(() => playback.value, state => {
    "worklet";
    if (suspendedOnUI?.get() || track || !continuity || !active || state.phase !== "playing") return;
    if (origin.value.key !== state.slideKey) origin.value = { key: state.slideKey, pose: continuePrevious ? continuity.value : null };
    const clock = sampleClock(state, previewTime, clockMode, buildDuration, settledBack, catchUp.value, advanceDuration);
    continuity.value = cameraEvaluator(scene.value, clock, origin.value.pose, enterDuration);
  });
  const uniforms = useDerivedValue(() => {
    "worklet";
    if (suspendedOnUI?.get()) return pooledOutput.value;
    const state = playback.value, preparing = state.phase === "preparing";
    // Prepare the live entry pose without advancing the shared clock or retained track.
    const sampleState = preparing ? { ...state, phase: "playing" as const } : state;
    const clock = sampleClock(sampleState, previewTime, clockMode, buildDuration, settledBack, catchUp.value, advanceDuration, stepOffset);
    let values: number[] | Float32Array<ArrayBuffer>;
    if (track) {
      if (state.phase === "preview" || state.phase === "preparing" || trackFrame.value.values.length === 0) {
        const sampled = sampleUniforms(scene.value, clock, null, 1, 1, uniformCache);
        const planned = pooled ? planSampler(sampled, copies, pooledOutput.value, lightOffset) : sampled;
        const previous = preparing ? { ...trackFrame.value, output: undefined, retired: { ...trackFrame.value.retired } } : createTrackFrame();
        values = trackSampler(previous, (preparing ? Float32Array.from(planned) : planned) as number[], ids, sampleState, track, declared, { scene: scene.value, clock, ids: sampleIds }).values;
      } else values = trackFrame.value.values;
    } else {
      const previous = state.phase === "preview" ? null
        : origin.value.key === state.slideKey ? origin.value.pose : state.phase === "playing" || preparing ? entryPose?.value : null;
      values = sampleUniforms(scene.value, clock, previous, enterDuration, effectiveScale.value, uniformCache);
    }
    return pooled && !track ? planSampler(values, copies, pooledOutput.value, lightOffset) : values;
  });
  return <JourneyGPU fallback={fallback ?? null}>
    <GPURenderGraph {...graph} uniforms={uniforms} width={width} height={height} background={background}
      borderRadius={borderRadius} previewTime={previewTime} clock="slide" active={active} renderScale={effectiveScale} />
  </JourneyGPU>;
}
