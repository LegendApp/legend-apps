// @ts-nocheck Exercise the compiled renderer with native leaf views replaced.
import "./nativeMock";
import { expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import React from "react";
import * as state from "@legendapp/state";
import * as stateReact from "@legendapp/state/react";
import { act, create } from "react-test-renderer";
import { usePresentation } from "@legend-apps/presentation";
import { getSlidesState, setCurrentSlide, setSlidesState, slidesState$ } from "../slidesStore";

const titleSpeed$ = state.observable(1);

function compiledRenderer() {
  const filename = fileURLToPath(new URL("../DeckRenderer.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [[require.resolve("babel-plugin-react-compiler"), { target: "19" }]],
  });
  const nativeLeaves = {
    uniwind: { useResolveClassNames: (value) => value === "text-center text-blue-400 text-5xl"
      ? { textAlign: "center", color: "#60a5fa", fontSize: 48 } : {} },
    // Keep tracking in the same ESM instance as slidesStore in this CJS harness.
    "@legendapp/state/react": stateReact,
    "@legendapp/state": state,
    "@legend-apps/scaled-view": { ScaledView: "scaled-view" },
    "react-native": {
      View: "view", Text: "text", Image: "image", Pressable: "pressable", Linking: {},
      StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
    },
    "./Layout": { Layout: "layout", LayoutStage: "layout-stage" },
    "./CodeBlock": { CodeBlock: "code" },
    "./LiquidGlass": { LiquidGlass: "liquid-glass" },
    "./Effect": { Effect: "effect" },
    "./TypeGPU": { TypeGPU: "gpu" },
    "./TypeGPUShader": { TypeGPUShader: "gpu-shader" },
    "./slidesSettings": { useBackgroundIntensitySetting: () => 1, titleAnimationSpeedSetting: { get: () => titleSpeed$.get() } },
    "./Webview": { Webview: "webview" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => nativeLeaves[name] ?? require(name), module, module.exports,
  );
  return module.exports.DeckRenderer;
}

test("compiled slide runtime deactivates on exit and reactivates on return", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Probe() { return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}">{[0, 1].map((index) => (
      <Slide key={index} metadataJson="{}" notes=""><Probe /></Slide>
    ))}</Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({ component: Document, currentSlide: 0, slides: [], config: {} });
    await act(() => { renderer = create(<DeckRenderer targetIndex={0} />); });
    // Audience transition layers keep the outgoing slide mounted across navigation.
    for (const current of [1, 0, 1, 0]) {
      await act(() => setCurrentSlide(current));
      const runtime = renderer.root.findByType("runtime").props.value;
      expect(runtime.currentSlide).toBe(current);
      expect(runtime.isActive).toBe(current === 0);
    }
  } finally {
    if (renderer) await act(() => renderer.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("render-prop steps receive the requested live or preview step without becoming reveals", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Document({ components: { Deck, Slide, Steps } }) {
    return <Deck configJson="{}"><Slide metadataJson="{}" notes="">
      <Steps count={3}>{(step) => <step-probe value={step} />}</Steps>
    </Slide></Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    await act(() => { renderer = create(<DeckRenderer targetIndex={0} />); });
    expect(getSlidesState().slides[0].metadata.steps).toBe(3);
    for (const step of [0, 1, 2, 1, 0]) {
      await act(() => setSlidesState({ currentStep: step }));
      expect(renderer.root.findByType("step-probe").props.value).toBe(step);
    }
    await act(() => renderer.update(<DeckRenderer isPreview targetIndex={0} targetStep={2} />));
    expect(renderer.root.findByType("step-probe").props.value).toBe(2);
    expect(getSlidesState().currentStep).toBe(0);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("fixed previews stay idle while the audience advances slides and steps", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  let renders = 0;
  function Probe() { renders++; return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}">{[0, 1].map((index) => <Slide key={index} metadataJson='{"steps":3}' notes=""><Probe /></Slide>)}</Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer isPreview targetIndex={1} targetStep={2} />); });
    renders = 0;
    for (const index of [1, 0, 1]) {
      await act(() => setCurrentSlide(index));
      await act(() => setSlidesState({ currentStep: 1, stepStartedAt: performance.now() }));
    }
    expect(renders).toBe(0);
    expect(tree.root.findByType("runtime").props.value).toMatchObject({ slideIndex: 1, stepIndex: 2, isActive: false, isPreview: true });
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("retained outgoing content ignores navigation until it returns to playback", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  let renders = 0;
  function Probe() { renders++; return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}">{[0, 1, 2].map(index =>
      <Slide key={index} metadataJson='{"steps":3}' notes=""><Probe /></Slide>)}</Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 2, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer targetIndex={0} />); });
    await act(() => setCurrentSlide(1));
    await act(() => tree.update(<DeckRenderer isOutgoing targetIndex={0} targetStep={2} />));
    const frozen = tree.root.findByType("runtime").props.value;
    expect(frozen).toMatchObject({ playbackPhase: "outgoing", isActive: false, isPreview: false, stepIndex: 2 });
    renders = 0;
    for (const index of [2, 1, 2]) {
      await act(() => setCurrentSlide(index));
      await act(() => setSlidesState({ currentStep: 1, stepStartedAt: performance.now() }));
    }
    expect(renders).toBe(0);
    expect(tree.root.findByType("runtime").props.value).toBe(frozen);
    await act(() => setCurrentSlide(0));
    await act(() => tree.update(<DeckRenderer targetIndex={0} />));
    expect(tree.root.findByType("runtime").props.value).toMatchObject({ playbackPhase: "playing", isActive: true, stepIndex: 0 });
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("Markdown classes override defaults and theme without recoloring nested emphasis", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Document({ components: { Deck, Slide, h1: Heading, strong: Strong } }) {
    return <Deck configJson='{"theme":{"color":"#ff0000","fontFamily":"Menlo"}}'>
      <Slide metadataJson="{}" notes=""><Heading className="text-center text-blue-400 text-5xl">
        Title <Strong>bold</Strong>
      </Heading></Slide>
    </Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer targetIndex={0} />); });
    const texts = tree.root.findAllByType("text");
    const heading = Object.assign({}, ...texts[0].props.style);
    expect(heading).toMatchObject({ textAlign: "center", color: "#60a5fa", fontSize: 48, fontFamily: "Menlo" });
    const bold = Object.assign({}, ...texts[1].props.style);
    expect(bold.fontWeight).toBe("700");
    expect(bold.color).toBeUndefined();
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("background frontmatter inherits, overrides and disables the deck image in previews", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson='{"background":"file:///deck/default.png"}'>
      <Slide metadataJson="{}" notes="">Default</Slide>
      <Slide metadataJson='{"background":"file:///deck/other.png"}' notes="">Override</Slide>
      <Slide metadataJson='{"background":false}' notes="">Off</Slide>
    </Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer isPreview targetIndex={0} />); });
    for (const [index, uri] of [[0, "file:///deck/default.png"], [1, "file:///deck/other.png"], [2, false], [0, "file:///deck/default.png"]]) {
      await act(() => tree.update(<DeckRenderer isPreview targetIndex={index} />));
      const background = tree.root.find((node) => node.type?.name === "Background");
      if (uri === false) expect(background.props.children).toBe(false);
      else expect(background.props.children.props).toMatchObject({ source: { uri }, resizeMode: "cover" });
    }
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("live navigation and preview changes never notify consumers during Deck render", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  let mounts = 0;
  function Probe() {
    React.useEffect(() => { mounts++; }, []);
    return <runtime value={usePresentation()} />;
  }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}">{[0, 1].map((index) =>
      <Slide key={index} metadataJson='{"steps":3}' notes=""><Probe /></Slide>)}</Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer />); });
    for (const index of [1, 0, 1]) {
      await act(() => setCurrentSlide(index));
      await act(() => setSlidesState({ currentStep: 2 }));
      expect(tree.root.findByType("runtime").props.value).toMatchObject({ slideIndex: index, stepIndex: 2, stepCount: 3 });
    }
    await act(() => tree.update(<DeckRenderer isPreview targetStep={1} />));
    expect(tree.root.findByType("runtime").props.value.stepIndex).toBe(1);
    await act(() => tree.update(<DeckRenderer isPreparing targetStep={0} />));
    expect(tree.root.findByType("runtime").props.value).toMatchObject({ isPreparing: true, stepIndex: 0 });
    expect(mounts).toBe(1);
    expect(log.mock.calls.some((args) => args.join(" ").includes("Cannot update a component"))).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});


test("runtime replacements and unmounts release their source subscriptions", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Probe() { return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}"><Slide metadataJson='{ "steps": 3 }' notes=""><Probe /></Slide></Deck>;
  }
  const fields = ["currentSlide", "currentStep", "slideStartedAt", "stepStartedAt", "stepEpochs", "direction"];
  const listeners = () => fields.map((field) => state.internal.getNode(slidesState$[field]).listenersImmediate?.size ?? 0);
  const baseline = listeners();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    for (let mount = 0; mount < 3; mount++) {
      await act(() => { tree = create(<DeckRenderer targetIndex={0} targetStep={0} />); });
      const mounted = listeners();
      expect(mounted.some((count, index) => count > baseline[index])).toBe(true);
      for (const step of [1, 2, 0]) {
        await act(() => tree.update(<DeckRenderer targetIndex={0} targetStep={step} />));
        expect(tree.root.findByType("runtime").props.value.stepIndex).toBe(step);
        expect(listeners()).toEqual(mounted);
      }
      await act(() => tree.unmount());
      tree = undefined;
      expect(listeners()).toEqual(baseline);
    }
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});


test("runtime remains reactive after StrictMode effect replay", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Probe() { return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}"><Slide metadataJson='{ "steps": 3 }' notes=""><Probe /></Slide></Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    await act(() => { tree = create(<React.StrictMode><DeckRenderer targetIndex={0} /></React.StrictMode>); });
    await act(() => setSlidesState({ currentStep: 2 }));
    expect(tree.root.findByType("runtime").props.value.stepIndex).toBe(2);
    expect(log.mock.calls.some((args) => args.join(" ").includes("Cannot update a component"))).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("Markdown images, tables, task lists and strike render native views", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Document({ components: c }) {
    return <c.Deck configJson="{}"><c.Slide metadataJson="{}" notes="">
      <c.h4>Heading</c.h4>
      <c.p>Before<c.img src="file:///picture.png" alt="Picture" />After</c.p>
      <c.table><c.thead><c.tr><c.th>Title</c.th></c.tr></c.thead><c.tbody><c.tr><c.td><c.del>Old</c.del></c.td></c.tr></c.tbody></c.table>
      <c.ol start={3}><c.li marker="3.">Third<c.ul><c.li><c.input checked />Done</c.li></c.ul></c.li></c.ol>
    </c.Slide></c.Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({ component: Document, currentSlide: 0, slides: [], config: {} });
    await act(() => { renderer = create(<DeckRenderer targetIndex={0} />); });
    expect(renderer.root.findAll(node => ["img", "table", "thead", "tbody", "tr", "th", "td", "del", "input", "h4"].includes(node.type))).toHaveLength(0);
    const image = renderer.root.findByType("image");
    expect(image.props.source.uri).toBe("file:///picture.png");
    expect(image.props.accessibilityLabel).toBe("Picture");
    await act(() => image.props.onLoad({ nativeEvent: { source: { width: 400, height: 300 } } }));
    expect(renderer.root.findByType("image").props.style.aspectRatio).toBe(4 / 3);
    expect(renderer.root.findAll(node => node.type === "text" && node.props.children === "3.")).toHaveLength(1);
    expect(renderer.root.findAll(node => node.type === "text" && node.props.accessibilityRole === "checkbox")).toHaveLength(1);
    expect(log.mock.calls.some(args => args.join(" ").includes("Slide unavailable"))).toBe(false);
  } finally { if (renderer) await act(() => renderer.unmount()); setSlidesState(initial); log.mockRestore(); }
});


test("title speed setting reaches live and preview runtimes without changing navigation", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Probe() { return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}"><Slide metadataJson="{}" notes=""><Probe /></Slide></Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer />); });
    for (const speed of [0.25, 2, 1]) {
      await act(() => titleSpeed$.set(speed));
      expect(tree.root.findByType("runtime").props.value).toMatchObject({ titleAnimationSpeed: speed, currentSlide: 0, currentStep: 0 });
    }
    await act(() => tree.update(<DeckRenderer isPreview targetIndex={0} />));
    await act(() => titleSpeed$.set(3));
    expect(tree.root.findByType("runtime").props.value).toMatchObject({ titleAnimationSpeed: 3, isPreview: true });
  } finally {
    if (tree) await act(() => tree.unmount());
    titleSpeed$.set(1);
    setSlidesState(initial);
    log.mockRestore();
  }
});


test("preview navigation retains compiled deck construction while resetting each selected slide", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  let documentMounts = 0, slideMounts = 0;
  function Probe() {
    const [identity] = React.useState(() => ++slideMounts);
    return <runtime identity={identity} value={usePresentation()} />;
  }
  function Document({ components: { Deck, Slide } }) {
    React.useEffect(() => { documentMounts++; }, []);
    return <Deck configJson="{}">{[0, 1].map(index =>
      <Slide key={index} metadataJson='{"steps":3}' notes=""><Probe /></Slide>)}</Deck>;
  }
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer isPreview targetIndex={0} targetStep={0} />); });
    const first = tree.root.findByType("runtime").props.identity;
    await act(() => tree.update(<DeckRenderer isPreview targetIndex={0} targetStep={2} />));
    expect(tree.root.findByType("runtime").props.identity).toBe(first);
    expect(tree.root.findByType("runtime").props.value.stepIndex).toBe(2);
    await act(() => tree.update(<DeckRenderer isPreview targetIndex={1} targetStep={0} />));
    expect(tree.root.findByType("runtime").props.identity).not.toBe(first);
    expect(tree.root.findByType("runtime").props.value.slideIndex).toBe(1);
    await act(() => tree.update(<DeckRenderer isPreview targetIndex={0} />));
    expect(tree.root.findByType("runtime").props.identity).not.toBe(first);
    expect(documentMounts).toBe(1);
    expect(slideMounts).toBe(3);
    await act(() => slidesState$.retryRevision.set(initial.retryRevision + 1));
    expect(documentMounts).toBe(2);
    await act(() => slidesState$.revision.set(initial.revision + 1));
    expect(documentMounts).toBe(3);
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
  }
});

test("a failed selected slide recovers on navigation without rebuilding the compiled deck", async () => {
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  let mounts = 0;
  function Broken() { throw new Error("broken preview"); }
  function Document({ components: { Deck, Slide } }) {
    React.useEffect(() => { mounts++; }, []);
    return <Deck configJson="{}"><Slide metadataJson="{}" notes=""><Broken /></Slide>
      <Slide metadataJson="{}" notes=""><healthy /></Slide></Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ component: Document, currentSlide: 0, slides: [], config: {} });
    await act(() => { tree = create(<DeckRenderer isPreview targetIndex={0} />); });
    expect(tree.root.findAllByType("healthy")).toHaveLength(0);
    await act(() => tree.update(<DeckRenderer isPreview targetIndex={1} />));
    expect(tree.root.findAllByType("healthy")).toHaveLength(1);
    expect(mounts).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});
