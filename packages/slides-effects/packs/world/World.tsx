import { GPURenderGraph, samplePlayback, useBackgroundSize, usePlayback, usePresentationValue } from "@legend-apps/presentation";
import { Children, Component, Fragment, isValidElement, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { makeMutable, useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import type { CameraOptions, CameraPose } from "./camera";
import { buildWorldGraph, worldGraphTopology } from "./render";
import { graphInstances, orbInstances, prepareWorldScene, primitive, sampleWorldCamera, sampleWorldUniforms,
  type Animated, type GraphOptions, type OrbsOptions, type PrimitiveOptions, type WorldScene } from "./scene";

export { tree, wave, subset, layoutTree } from "./graph";
export { evaluateCamera } from "./camera";
export { buildWorldGraph } from "./render";
export { orbInstances, graphInstances, primitive, prepareWorldScene, sampleWorldUniforms } from "./scene";
export type { Shot, CameraPose, Vec3 } from "./camera";
export type { Animated, GraphOptions, OrbsOptions, PrimitiveOptions, WorldScene } from "./scene";

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
  enter?: { from: "previous"; duration?: number }; scrim?: boolean | number; fallback?: ReactNode; active?: boolean;
  children?: ReactNode; accessibilityLabel?: string;
};
export function World(props: WorldProps) {
  // id defines a continuity boundary; changing it creates a fresh sampled origin.
  return <WorldSurface key={props.id ?? "world"} {...props} />;
}
function worldContent(children: ReactNode, quality: WorldScene["quality"], exposure: Animated<number>, backgroundColor: string, scrim: boolean | number) {
  const scene: WorldScene = { instances: [], quality, exposure, backgroundColor, scrim: typeof scrim === "number" ? scrim : scrim ? 0.4 : 0 };
  const overlay: ReactNode[] = [];
  function collect(content: ReactNode) {
    Children.forEach(content, child => {
      if (!isValidElement<Record<string, unknown>>(child)) {
        if (child && (typeof child !== "string" || child.trim())) overlay.push(child);
        return;
      }
      const options = child.props;
      if (child.type === Fragment) collect(options.children as ReactNode);
      else if (child.type === Camera) scene.camera = options as CameraOptions;
      else if (child.type === Graph) scene.instances.push(...graphInstances(options as GraphOptions));
      else if (child.type === Orbs) scene.instances.push(...orbInstances(options));
      else if (child.type === Sphere) scene.instances.push(primitive("sphere", options));
      else if (child.type === Box) scene.instances.push(primitive("box", options));
      else if (child.type === Tube) scene.instances.push(primitive("tube", options));
      else if (child.type === Ring) scene.instances.push(primitive("ring", { ...options, size: options.radius ?? options.size } as PrimitiveOptions));
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
function WorldSurface({ id, width: configuredWidth = 1920, height: configuredHeight = 1080, background = false, backgroundColor = "#05060a", quality = "auto",
  exposure = 1, previewTime = 4, borderRadius = 0, enter, scrim = false, fallback, active = true, children, accessibilityLabel }: WorldProps) {
  const size = useBackgroundSize();
  const width = background ? size.width : configuredWidth;
  const height = background ? size.height : configuredHeight;
  // GPU pipelines keep their identity across clock navigation and surface resizes.
  const { prepared, overlay } = useMemo(() => worldContent(children, quality, exposure, backgroundColor, scrim), [children, quality, exposure, backgroundColor, scrim]);
  const { counts: { box, ring, sphere, tube }, backgroundVector: [red, green, blue] } = worldGraphTopology(prepared);
  const graph = useMemo(() => buildWorldGraph({ quality, counts: { box, ring, sphere, tube }, backgroundVector: [red, green, blue] }),
    [quality, box, ring, sphere, tube, red, green, blue]);
  const playback = usePlayback();
  const [continuity] = useState(() => id ? retainedPose(id) : undefined);
  const origin = useSharedValue<{ key: string; pose: CameraPose | null }>({ key: "", pose: null });
  const sampleClock = samplePlayback;
  const cameraEvaluator = sampleWorldCamera;
  const sampleUniforms = sampleWorldUniforms;
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
    return sampleUniforms(prepared, clock, previous, enterDuration);
  }, [prepared, previewTime, enterDuration, entryPose]);
  return <View pointerEvents="box-none" accessibilityLabel={accessibilityLabel}
    style={{ width, height, borderRadius, overflow: "hidden", backgroundColor, ...(background ? { position: "absolute", left: 0, top: 0 } as const : {}) }}>
    <WorldGPU fallback={fallback ?? null}>
      <GPURenderGraph {...graph} uniforms={uniforms} width={width} height={height} background={background}
        borderRadius={borderRadius} previewTime={previewTime} clock="slide" active={active} />
    </WorldGPU>
    {overlay.length > 0 && <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width, height }}>{overlay}</View>}
  </View>;
}
