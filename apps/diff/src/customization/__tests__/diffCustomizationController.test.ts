import { createDiffCustomizationController, type DiffCustomizationDependencies } from "../diffCustomizationController";
import { emptyCustomizationHistory, type DiffCustomizationHistory } from "../diffCustomizationModel";

function setup(overrides: Partial<DiffCustomizationDependencies> = {}) {
  let saved: DiffCustomizationHistory | undefined;
  const dependencies: DiffCustomizationDependencies = {
    readHistory: () => saved,
    saveHistory: history => { saved = JSON.parse(JSON.stringify(history)); },
    baseline: async () => ({ baseId: "v1", files: { "diffPalette.ts": "red small" } }),
    compile: jest.fn(async (_baseline, files) => files["diffPalette.ts"]!),
    generate: jest.fn(async () => ({ title: "Blue", summary: "Change color", edits: [{ path: "diffPalette.ts", before: "red", after: "blue" }] })),
    validate: jest.fn(), openPreview: jest.fn(async () => {}), closePreview: jest.fn(async () => {}), prepareActivation: jest.fn(async () => true),
    ...overrides,
  };
  return { controller: createDiffCustomizationController(dependencies), dependencies, saved: () => saved };
}

it("previews without saving and keeps the exact generated code", async () => {
  const { controller, dependencies, saved } = setup();
  await controller.initialize();
  await controller.generate("Make it blue");
  expect(saved()).toBeUndefined();
  expect(controller.state$.preview.peek()?.code).toBe("blue small");
  await controller.keep();
  expect(saved()?.versions[0]?.code).toBe("blue small");
  expect(controller.state$.preview.peek()).toBeNull();
  expect(dependencies.generate).toHaveBeenCalledTimes(1);
  expect(dependencies.compile).toHaveBeenCalledTimes(1);
});

it("preserves the saved app when compilation or early-change replay fails", async () => {
  const { controller, dependencies, saved } = setup();
  await controller.initialize();
  await controller.generate("Blue"); await controller.keep();
  jest.mocked(dependencies.generate).mockResolvedValueOnce({ title: "Green", summary: "Depends on blue", edits: [{ path: "diffPalette.ts", before: "blue", after: "green" }] });
  await controller.generate("Green"); await controller.keep();
  const previous = saved();
  await controller.change(controller.activeVersion()!.changes[0]!.id, "delete");
  expect(controller.state$.error.peek()).toContain("Green");
  expect(controller.state$.preview.peek()).toBeNull();
  expect(saved()).toEqual(previous);
  jest.mocked(dependencies.compile).mockRejectedValueOnce(new Error("Invalid JSX"));
  await controller.change(controller.activeVersion()!.changes[1]!.id, "delete");
  expect(controller.state$.error.peek()).toBe("Invalid JSX");
  expect(saved()).toEqual(previous);
});

it("cancels late generation and rejects overlapping requests", async () => {
  let finish!: (response: unknown) => void;
  const { controller, dependencies } = setup({ generate: jest.fn(() => new Promise(resolve => { finish = resolve; })) });
  await controller.initialize();
  const pending = controller.generate("Blue");
  await controller.generate("Second request");
  controller.cancel();
  finish({ title: "Blue", summary: "Color", edits: [{ path: "diffPalette.ts", before: "red", after: "blue" }] });
  await pending;
  expect(dependencies.generate).toHaveBeenCalledTimes(1);
  expect(dependencies.compile).not.toHaveBeenCalled();
  expect(controller.state$.preview.peek()).toBeNull();
  expect(controller.state$.status.peek()).toBe("idle");
});

it("replays independent later changes when editing, disabling and deleting an earlier prompt", async () => {
  const { controller, dependencies } = setup();
  await controller.initialize(); await controller.generate("Blue"); await controller.keep();
  const firstId = controller.activeVersion()!.changes[0]!.id;
  jest.mocked(dependencies.generate).mockResolvedValueOnce({ title: "Large", summary: "Size", edits: [{ path: "diffPalette.ts", before: "small", after: "large" }] });
  await controller.generate("Large"); await controller.keep();
  jest.mocked(dependencies.generate).mockResolvedValueOnce({ title: "Green", summary: "Color", edits: [{ path: "diffPalette.ts", before: "red", after: "green" }] });
  await controller.generate("Green", firstId);
  expect(controller.state$.preview.peek()?.code).toBe("green large");
  expect(controller.activeVersion()?.code).toBe("blue large");
  await controller.keep();
  expect(controller.activeVersion()!.changes[0]!.id).toBe(firstId);
  await controller.change(firstId, "toggle");
  expect(controller.state$.preview.peek()?.code).toBe("red large");
  await controller.keep();
  await controller.change(firstId, "delete");
  expect(controller.state$.preview.peek()?.changes).toHaveLength(1);
  expect(controller.state$.preview.peek()?.code).toBe("red large");
});

it("keeps drafts and the current app if activation is cancelled", async () => {
  const { controller, saved } = setup({ prepareActivation: async () => false });
  await controller.initialize(); await controller.generate("Blue");
  await controller.keep();
  expect(saved()).toBeUndefined();
  expect(controller.state$.preview.peek()).not.toBeNull();
  await controller.revert();
  expect(controller.state$.preview.peek()).toBeNull();
});

it("restores stored code without another generation or compilation", async () => {
  const { controller, dependencies, saved } = setup();
  await controller.initialize(); await controller.generate("Blue"); await controller.keep();
  const first = controller.activeVersion()!;
  await controller.reset();
  expect(saved()?.activeId).toBeNull();
  expect(saved()?.versions).toHaveLength(1);
  await controller.restore(first.id);
  expect(controller.state$.preview.peek()?.code).toBe(first.code);
  expect(dependencies.generate).toHaveBeenCalledTimes(1);
  expect(dependencies.compile).toHaveBeenCalledTimes(1);
});

it("does not publish if saving fails or the preview cannot render", async () => {
  const { controller } = setup({ saveHistory: () => { throw new Error("Disk unavailable"); } });
  await controller.initialize(); await controller.generate("Blue"); await controller.keep();
  expect(controller.activeVersion()).toBeNull();
  expect(controller.state$.preview.peek()).not.toBeNull();
  expect(controller.state$.error.peek()).toBe("Disk unavailable");
  const broken = setup({ openPreview: async () => { throw new Error("Render failed"); } });
  await broken.controller.initialize(); await broken.controller.generate("Blue");
  expect(broken.controller.state$.preview.peek()).toBeNull();
  expect(broken.saved()).toBeUndefined();
});

it("checks app compatibility before evaluating saved code and allows recovery", async () => {
  const original = setup();
  await original.controller.initialize(); await original.controller.generate("Blue"); await original.controller.keep();
  const changed = setup({ readHistory: original.saved, baseline: async () => ({ baseId: "v2", files: {} }) });
  await changed.controller.initialize();
  expect(changed.dependencies.validate).not.toHaveBeenCalled();
  expect(changed.controller.state$.ready.peek()).toBe(false);
  expect(changed.controller.state$.error.peek()).toContain("different app version");
  await changed.controller.reset();
  expect(changed.controller.state$.ready.peek()).toBe(true);
  expect(changed.controller.activeVersion()).toBeNull();
  expect(changed.saved()?.versions).toHaveLength(1);
});

it("compiles the original viewer when removing the final change so preview host restrictions still apply", async () => {
  const { controller, dependencies } = setup();
  await controller.initialize(); await controller.generate("Blue"); await controller.keep();
  await controller.change(controller.activeVersion()!.changes[0]!.id, "delete");
  expect(controller.state$.preview.peek()?.code).toBe("red small");
  expect(controller.state$.preview.peek()?.changes).toEqual([]);
  expect(dependencies.compile).toHaveBeenCalledTimes(2);
});

it("auto-keeps only after a preview renders and reset preserves preferences", async () => {
  const { controller, dependencies, saved } = setup({ readHistory: () => ({ ...emptyCustomizationHistory(), autoKeep: true }) });
  await controller.initialize(); await controller.generate("Blue");
  expect(dependencies.openPreview).toHaveBeenCalledTimes(1);
  expect(saved()?.versions[0]?.code).toBe("blue small");
  await controller.reset();
  expect(saved()?.autoKeep).toBe(true);
});
