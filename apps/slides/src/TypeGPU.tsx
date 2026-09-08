import { useSlideLifecycle, type TypeGPUScene, type TypeGPUSceneInstance } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";
import { tgpu, type TgpuRoot } from "typegpu";
import { reportSlideError } from "./slidesStore";
import { releaseGPUResources } from "./gpuCleanup";

export type TypeGPUProps = {
  backgroundColor?: string;
  height?: number;
  previewTime?: number;
  scene: TypeGPUScene;
  style?: StyleProp<ViewStyle>;
  transparent?: boolean;
  width?: number;
};

export function TypeGPU({
  backgroundColor = "#000",
  height = 540,
  previewTime: configuredPreviewTime = 3.5,
  scene,
  style,
  transparent = false,
  width = 960,
}: TypeGPUProps) {
  const { isActive, isPreview, isPreparing, slideIndex, startedAt } = useSlideLifecycle();
  const previewTime = isPreparing ? 0 : configuredPreviewTime;
  const canvasRef = useRef<CanvasRef>(null);
  const [error, setError] = useState<string>();

  const playback = useRef({ isActive, isPreview, previewTime, startedAt });
  const resume = useRef<(() => void) | undefined>(undefined);
  const shouldRender = isActive || isPreview;

  useEffect(() => {
    playback.current = { isActive, isPreview, previewTime, startedAt };
    resume.current?.();
  }, [isActive, isPreview, previewTime, startedAt]);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    let cancelled = false;
    let stopped = false;
    let frameId = 0;
    let device: GPUDevice | undefined;
    let root: TgpuRoot | undefined;
    let sceneInstance: TypeGPUSceneInstance | undefined;
    const report = (caught: unknown) => reportSlideError(caught, slideIndex, playback.current.isPreview);

    const dispose = () => {
      cancelAnimationFrame(frameId);
      // Drain whatever has arrived so far. Async setup may finish after an
      // unmount, so later calls must still release newly acquired resources.
      const instance = sceneInstance;
      const gpuRoot = root;
      const gpuDevice = device;
      sceneInstance = undefined;
      root = undefined;
      device = undefined;
      releaseGPUResources(instance?.dispose?.bind(instance), () => {
        if (gpuRoot) gpuRoot.destroy();
        else gpuDevice?.destroy();
      }, report);
    };

    const fail = (caught: unknown) => {
      if (cancelled || stopped) return;
      stopped = true;
      setError(caught instanceof Error ? caught.message : String(caught));
      report(caught);
      dispose();
    };

    async function start() {
      try {
        setError(undefined);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) {
          throw new Error("No WebGPU adapter is available.");
        }
        device = await adapter.requestDevice();
        if (cancelled || !canvasRef.current) {
          dispose();
          return;
        }
        const acquiredDevice = device;
        void device.lost.then((info) => {
          if (device === acquiredDevice) fail(new Error(`WebGPU device lost: ${info.message}`));
        }).catch(fail);
        device.addEventListener?.("uncapturederror", (event) => {
          event.preventDefault?.();
          fail(event.error);
        });

        const surface = canvasRef.current.getNativeSurface();
        const context = canvasRef.current.getContext("webgpu");
        if (!context) {
          throw new Error("The WebGPU canvas is not ready.");
        }
        surface.width = width;
        surface.height = height;
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ alphaMode: "premultiplied", device, format });
        root = tgpu.initFromDevice({ device });
        sceneInstance = await scene({
          device,
          format,
          isPreview: playback.current.isPreview,
          root,
          size: { height, width },
        });
        if (cancelled || stopped) {
          dispose();
          return;
        }

        let firstTimestamp: number | undefined;
        let previousTimestamp: number | undefined;
        let frame = 0;
        const render = (timestamp: number) => {
          if (cancelled || stopped || !sceneInstance) {
            return;
          }
          try {
            const { isActive, isPreview, previewTime, startedAt } = playback.current;
            firstTimestamp ??= timestamp;
            const elapsed = isPreview ? previewTime : Math.max(0, timestamp - (startedAt ?? firstTimestamp)) / 1000;
            const deltaTime = previousTimestamp === undefined || isPreview
              ? 0
              : (timestamp - previousTimestamp) / 1000;
            previousTimestamp = timestamp;
            sceneInstance.render({
              deltaTime,
              frame,
              isPreview,
              time: elapsed,
              timestamp,
              view: context.getCurrentTexture().createView(),
            });
            context.present();
            frame += 1;
            if (isActive && !isPreview) {
              frameId = requestAnimationFrame(render);
            }
          } catch (caught) {
            fail(caught);
          }
        };
        resume.current = () => {
          cancelAnimationFrame(frameId);
          firstTimestamp = undefined;
          previousTimestamp = undefined;
          frame = 0;
          frameId = requestAnimationFrame(render);
        };
        resume.current();
      } catch (caught) {
        fail(caught);
        dispose();
      }
    }

    void start();
    return () => {
      cancelled = true;
      resume.current = undefined;
      dispose();
    };
  }, [height, shouldRender, scene, slideIndex, width]);

  return (
    <View style={[styles.container, { backgroundColor, height, width }, style]}>
      <Canvas ref={canvasRef} style={{ height, width }} transparent={transparent} />
      {error ? <Text style={styles.error}>{isPreview ? error : "Animation unavailable"}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  error: {
    color: "#fecdd3",
    fontSize: 18,
    left: 28,
    position: "absolute",
    right: 28,
    textAlign: "center",
  },
});
