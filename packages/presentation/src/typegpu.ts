import type { TgpuRoot } from "typegpu";

export type TypeGPUSceneSize = {
  height: number;
  width: number;
};

export type TypeGPUSceneContext = {
  device: GPUDevice;
  format: GPUTextureFormat;
  isPreview: boolean;
  root: TgpuRoot;
  size: TypeGPUSceneSize;
};

export type TypeGPUFrameContext = {
  deltaTime: number;
  frame: number;
  isPreview: boolean;
  time: number;
  timestamp: number;
  view: GPUTextureView;
};

export type TypeGPUSceneInstance = {
  dispose?(): Promise<void> | void;
  render(context: TypeGPUFrameContext): void;
};

export type TypeGPUScene = (
  context: TypeGPUSceneContext,
) => Promise<TypeGPUSceneInstance> | TypeGPUSceneInstance;

export function defineTypeGPUScene(scene: TypeGPUScene) {
  return scene;
}
