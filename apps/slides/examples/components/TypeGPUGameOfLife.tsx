import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";
import { d, std, tgpu, type TgpuRoot } from "typegpu";

const canvasSize = 600;
const gridSize = d.vec2u(64);

export function TypeGPUGameOfLife() {
  const { isActive, isPreview } = useSlideLifecycle();
  const canvasRef = useRef<CanvasRef>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isActive && !isPreview) {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let device: GPUDevice | undefined;
    let root: TgpuRoot | undefined;

    async function start() {
      try {
        setError(undefined);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) {
          throw new Error("No WebGPU adapter is available.");
        }
        device = await adapter.requestDevice();
        if (cancelled || !canvasRef.current) {
          device.destroy();
          return;
        }

        const surface = canvasRef.current.getNativeSurface();
        const context = canvasRef.current.getContext("webgpu");
        if (!context) {
          throw new Error("The WebGPU canvas is not ready.");
        }
        surface.width = canvasSize;
        surface.height = canvasSize;
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ alphaMode: "premultiplied", device, format });
        root = tgpu.initFromDevice({ device });

        const computeLayout = tgpu.bindGroupLayout({
          current: { storage: d.arrayOf(d.u32) },
          next: { access: "mutable", storage: d.arrayOf(d.u32) },
        });

        const getIndex = (x: number, y: number) => {
          "use gpu";
          return (y % gridSize.y) * gridSize.x + (x % gridSize.x);
        };
        const getCell = (x: number, y: number) => {
          "use gpu";
          return computeLayout.$.current[getIndex(x, y)];
        };
        const countNeighbors = (x: number, y: number) => {
          "use gpu";
          return getCell(x - 1, y - 1) + getCell(x, y - 1) + getCell(x + 1, y - 1)
            + getCell(x - 1, y) + getCell(x + 1, y)
            + getCell(x - 1, y + 1) + getCell(x, y + 1) + getCell(x + 1, y + 1);
        };

        const computePipeline = root.createGuardedComputePipeline((x, y) => {
          "use gpu";
          const neighbors = countNeighbors(x, y);
          computeLayout.$.next[getIndex(x, y)] = d.u32(
            std.select(neighbors === 3, neighbors === 2 || neighbors === 3, getCell(x, y) === 1),
          );
        });

        const squareBuffer = root
          .createBuffer(d.arrayOf(d.u32, 8), [0, 0, 1, 0, 0, 1, 1, 1])
          .$usage("vertex");
        const squareVertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2u), "vertex");
        const cellsVertexLayout = tgpu.vertexLayout(d.arrayOf(d.u32), "instance");
        const vertexFn = tgpu.vertexFn({
          in: {
            cell: d.u32,
            iid: d.builtin.instanceIndex,
            pos: d.vec2u,
          },
          out: {
            cell: d.interpolate("flat", d.u32),
            pos: d.builtin.position,
            uv: d.vec2f,
          },
        })(({ cell, iid, pos }) => {
          const width = d.u32(gridSize.x);
          const height = d.u32(gridSize.y);
          const column = iid % width;
          const row = d.u32(iid / width);
          const gridX = column + pos.x;
          const gridY = row + pos.y;
          const maxDimension = d.f32(std.max(width, height));
          const x = (d.f32(gridX) * 2 - d.f32(width)) / maxDimension;
          const y = (d.f32(gridY) * 2 - d.f32(height)) / maxDimension;
          return {
            cell,
            pos: d.vec4f(x, y, 0, 1),
            uv: d.vec2f((x + 1) * 0.5, (y + 1) * 0.5),
          };
        });
        const fragmentFn = tgpu.fragmentFn({
          in: {
            cell: d.interpolate("flat", d.u32),
            uv: d.vec2f,
          },
          out: d.vec4f,
        })(({ cell, uv }) => {
          if (cell === d.u32(0)) {
            std.discard();
          }
          const color = uv.div(1.5);
          return d.vec4f(color.x, color.y, 1 - color.x, 0.8);
        });
        const renderPipeline = root.createRenderPipeline({
          attribs: {
            cell: cellsVertexLayout.attrib,
            pos: squareVertexLayout.attrib,
          },
          fragment: fragmentFn,
          primitive: { topology: "triangle-strip" },
          targets: { format },
          vertex: vertexFn,
        });

        const cellCount = gridSize.x * gridSize.y;
        const buffers = [
          root
            .createBuffer(
              d.arrayOf(d.u32, cellCount),
              Array.from({ length: cellCount }, () => Math.random() < 0.25 ? 1 : 0),
            )
            .$usage("storage", "vertex"),
          root.createBuffer(d.arrayOf(d.u32, cellCount)).$usage("storage", "vertex"),
        ];
        const bindGroups = [0, 1].map((index) => root!.createBindGroup(computeLayout, {
          current: buffers[index],
          next: buffers[1 - index],
        }));

        let swap = 0;
        let lastTimestamp = performance.now();
        const render = (timestamp: number) => {
          if (cancelled || !root) {
            return;
          }
          if (timestamp - lastTimestamp > 8.33) {
            lastTimestamp = timestamp;
            computePipeline.with(bindGroups[swap]).dispatchThreads(gridSize.x, gridSize.y);
            renderPipeline
              .withColorAttachment({
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store",
                view: context.getCurrentTexture().createView(),
              })
              .with(cellsVertexLayout, buffers[1 - swap])
              // The u32 pairs are the same vertex bytes as vec2u; TypeGPU cannot express that reinterpretation yet.
              // @ts-expect-error The upstream example intentionally binds this compact buffer to the vec2u layout.
              .with(squareVertexLayout, squareBuffer)
              .draw(4, cellCount);
            swap ^= 1;
            context.present();
          }
          if (isActive && !isPreview) {
            frame = requestAnimationFrame(render);
          }
        };
        frame = requestAnimationFrame(render);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (root) {
        root.destroy();
      } else {
        device?.destroy();
      }
    };
  }, [isActive, isPreview]);

  return (
    <View style={styles.container}>
      <Canvas ref={canvasRef} style={styles.canvas} transparent />
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  error: { color: "#be123c", fontSize: 18, left: 24, position: "absolute", right: 24, textAlign: "center" },
});
