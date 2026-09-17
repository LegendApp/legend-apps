import { useObservable, useValue } from "@legendapp/state/react";
import {
  Background,
  FocusRegion,
  SharedElement,
  FocusStage,
  normalizeTransition,
  BackgroundHost,
  useBackgroundHost,
  useHasBackground,
  PresentationObservableProvider,
  type PresentationRuntime,
  renderNativeChildren,
  type CompiledDeckProps,
  type CompiledSlideProps,
  type DeckConfig,
  type PresentationTemplateProps,
  type SlideConfig,
} from "@legend-apps/presentation";
import { ScaledView } from "@legend-apps/scaled-view";
import React, { Children, createContext, isValidElement, useContext, useEffect, type ReactElement, type ReactNode } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewProps,
} from "react-native";
import { getSlideStepCount, getSlidesState, nextSlide, previousSlide, reportSlideError, setCurrentSlide, setSlidesState, slidesState$ } from "./slidesStore";
import { ContentErrorBoundary } from "./ContentErrorBoundary";
import { Step, Steps, resolveSteps } from "./steps";
import { CodeBlock } from "./CodeBlock";
import { LiquidGlass } from "./LiquidGlass";
import { Effect } from "./Effect";
import { TypeGPU } from "./TypeGPU";
import { Webview } from "./Webview";
import { SlideCaptureContext } from "./SlideCaptureContext";
import { getCodeLanguage, getCodeSource } from "./codeBlocks";
import { resolveSlideTemplate } from "./slideTemplates";

function parseObject<T extends object>(value: string, fallback: T) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function Slide({ children }: CompiledSlideProps) {
  return children;
}

function MissingSlideTemplate({ reference }: { reference: string }): never {
  throw new Error(`Template "${reference}" is not available in the compiled deck.`);
}

const DeckRenderContext = createContext<{ isPreview: boolean; isPreparing?: boolean; targetIndex?: number; targetStep?: number }>({ isPreview: false });

function Deck({ children, configJson }: CompiledDeckProps) {
  const { isPreview, isPreparing, targetIndex, targetStep } = useContext(DeckRenderContext);
  const templates = useValue(slidesState$.templates);
  const elements = Children.toArray(children).filter(isValidElement) as ReactElement<CompiledSlideProps>[];
  const parsedConfig = parseObject<DeckConfig>(configJson, {});
  const config = { ...parsedConfig, transition: normalizeTransition(parsedConfig.transition) };
  const resolved = elements.map((element) => resolveSteps(element.props.children, [markdownComponents.ul, markdownComponents.ol]));
  const slides = elements.map((element, index) => ({
    metadata: (() => {
      const parsed = parseObject<SlideConfig>(element.props.metadataJson, {});
      return { ...parsed, steps: Math.max(resolved[index].steps, typeof parsed.steps === "number" ? parsed.steps : 1), transition: normalizeTransition(parsed.transition) };
    })(),
    notes: element.props.notes,
  }));
  const requestedIndex = useValue(() => targetIndex ?? slidesState$.currentSlide.get());
  const selectedIndex = Math.max(0, Math.min(requestedIndex, elements.length - 1));

  useEffect(() => {
    const current = getSlidesState();
    if (JSON.stringify(current.config) !== JSON.stringify(config) || JSON.stringify(current.slides) !== JSON.stringify(slides)) {
      setSlidesState({ config, currentSlide: Math.min(current.currentSlide, Math.max(0, slides.length - 1)), slides });
    }
  }, [configJson, elements.length]);

  const stepCount = getSlideStepCount(slides[selectedIndex]);
  const runtime$ = useObservable<PresentationRuntime>(() => {
    // Fixed previews do not subscribe to live navigation or animation epochs.
    const currentSlide = isPreview ? selectedIndex : slidesState$.currentSlide.get();
    const currentStep = isPreview ? targetStep ?? 0 : slidesState$.currentStep.get();
    return {
      currentSlide, currentStep, goTo: setCurrentSlide,
      isActive: !isPreview && selectedIndex === currentSlide,
      isPreview: Boolean(isPreview), isPreparing,
      next: nextSlide, previous: previousSlide,
      slideCount: elements.length, slideIndex: selectedIndex, stepCount,
      stepIndex: Math.max(0, Math.min(targetStep ?? (selectedIndex === currentSlide ? currentStep : 0), stepCount - 1)),
      startedAt: isPreview ? undefined : slidesState$.slideStartedAt.get(),
      stepStartedAt: isPreview ? undefined : slidesState$.stepStartedAt.get(),
      stepEpochs: isPreview ? undefined : slidesState$.stepEpochs.get(),
      direction: isPreview ? undefined : slidesState$.direction.get(),
    };
  }, [isPreview, isPreparing, selectedIndex, targetStep, stepCount, elements.length]);
  const selected = elements[selectedIndex];
  if (!selected) return null;
  const selectedMetadata = slides[selectedIndex].metadata;
  const resolvedTemplate = resolveSlideTemplate(templates, config, selectedMetadata);
  const Template = resolvedTemplate.component;
  const content = renderMdxChildren(resolved[selectedIndex].content);
  return (
    <PresentationObservableProvider value={runtime$}>
      <SlideErrorBoundary index={selectedIndex} isPreview={isPreview}>
        {resolvedTemplate.reference && !Template
          ? <MissingSlideTemplate reference={resolvedTemplate.reference} />
          : Template
          ? <Template deck={config} slide={selectedMetadata}>{content}</Template>
          : <View style={styles.slideContent}>{content}</View>}
      </SlideErrorBoundary>
    </PresentationObservableProvider>
  );
}

function MarkdownText({ children, style }: { children?: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useValue(slidesState$.config.theme);
  const themeStyle = {
    ...(theme?.color ? { color: theme.color } : {}),
    ...(theme?.fontFamily ? { fontFamily: theme.fontFamily } : {}),
  };
  return <Text style={[style, themeStyle]}>{children}</Text>;
}

function MarkdownLink({ children, href }: { children?: ReactNode; href?: string }) {
  return <MarkdownText style={styles.link}><Text onPress={() => href && void Linking.openURL(href)}>{children}</Text></MarkdownText>;
}

function renderMdxChildren(children: ReactNode) {
  return renderNativeChildren(children, (text) => <MarkdownText>{text}</MarkdownText>);
}

function NativeView({ children, ...props }: ViewProps) {
  return <View {...props}>{renderMdxChildren(children)}</View>;
}

function NativePressable({ children, ...props }: PressableProps) {
  if (typeof children === "function") {
    return <Pressable {...props}>{(state) => renderMdxChildren(children(state))}</Pressable>;
  }
  return <Pressable {...props}>{renderMdxChildren(children)}</Pressable>;
}

function MarkdownCode({ children }: { children?: ReactNode }) {
  return <MarkdownText style={styles.code}>{children}</MarkdownText>;
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  const child = Children.count(children) === 1 ? Children.toArray(children)[0] : undefined;
  if (isValidElement(child)) {
    const props = child.props as { children?: unknown; className?: unknown };
    const source = getCodeSource(props.children);
    if (source !== undefined) {
      return <CodeBlock language={getCodeLanguage(props.className)} source={source} />;
    }
  }
  return <NativeView style={styles.pre}>{children}</NativeView>;
}

const markdownComponents = {
  Deck,
  Background,
  FocusRegion,
  SharedElement,
  Effect,
  LiquidGlass,
  Slide,
  Step,
  Steps,
  View: NativeView,
  Text,
  Image,
  Pressable: NativePressable,
  TypeGPU,
  Webview,
  h1: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.h1}>{children}</MarkdownText>,
  h2: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.h2}>{children}</MarkdownText>,
  h3: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.h3}>{children}</MarkdownText>,
  p: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.paragraph}>{children}</MarkdownText>,
  strong: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.strong}>{children}</MarkdownText>,
  em: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.emphasis}>{children}</MarkdownText>,
  code: MarkdownCode,
  pre: MarkdownPre,
  blockquote: ({ children }: { children?: ReactNode }) => <NativeView style={styles.blockquote}>{children}</NativeView>,
  ul: ({ children }: { children?: ReactNode }) => <NativeView style={styles.list}>{children}</NativeView>,
  ol: ({ children }: { children?: ReactNode }) => <NativeView style={styles.list}>{children}</NativeView>,
  li: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.listItem}>• {children}</MarkdownText>,
  a: MarkdownLink,
};

export function DeckRenderer({
  isPreview = false,
  isPreparing = false,
  targetIndex,
  targetStep,
}: {
  isPreview?: boolean;
  isPreparing?: boolean;
  targetIndex?: number;
  targetStep?: number;
}) {
  const Component = useValue(() => slidesState$.compiled.get()?.component ?? null);
  const revision = useValue(slidesState$.revision);
  const retryRevision = useValue(slidesState$.retryRevision);
  if (!Component) {
    return null;
  }
  return (
    <DeckRenderContext.Provider value={{ isPreview, isPreparing, targetIndex, targetStep }}>
      <SlideErrorBoundary index={targetIndex ?? 0} isPreview={isPreview} key={`${revision}:${retryRevision}:${targetIndex ?? "current"}`}>
        <Component components={markdownComponents} />
      </SlideErrorBoundary>
    </DeckRenderContext.Provider>
  );
}

function SlideErrorBoundary({ children, index, isPreview }: { children: ReactNode; index: number; isPreview: boolean }) {
  return (
    <ContentErrorBoundary
      fallback={<View className="flex-1 items-center justify-center"><Text style={styles.paragraph}>Slide unavailable</Text></View>}
      onError={(error) => reportSlideError(error, index, isPreview)}
    >
      {children}
    </ContentErrorBoundary>
  );
}

export function SlideCanvas({ children, captureEnabled = true, targetIndex, isPreview = false }: { children: ReactNode; captureEnabled?: boolean; targetIndex?: number; isPreview?: boolean }) {
  const hosted = useBackgroundHost();
  const selectedIndex = useValue(() => targetIndex ?? slidesState$.currentSlide.get());
  const color = useValue(() => slidesState$.config.theme.backgroundColor.get() ?? "#111827");
  const content = <SlideCanvasContent captureEnabled={captureEnabled}>{children}</SlideCanvasContent>;
  return hosted ? content : <BackgroundHost slideIndex={selectedIndex} color={color} isPreview={isPreview}>{content}</BackgroundHost>;
}

function SlideCanvasContent({ children, captureEnabled }: { children: ReactNode; captureEnabled: boolean }) {
  const hasBackground = useHasBackground();
  const config = useValue(slidesState$.config);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const aspectParts = config.aspectRatio?.split(/[/:]/).map(Number) ?? [];
  const aspectRatio = aspectParts.length === 2 && aspectParts.every((value) => Number.isFinite(value) && value > 0)
    ? aspectParts[0] / aspectParts[1]
    : 16 / 9;
  const width = config.width ?? 1920;
  const height = config.height ?? width / aspectRatio;
  const scale = Math.min(size.width / width || 0, size.height / height || 0);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const backgroundColor = hasBackground ? "transparent" : config.theme?.backgroundColor ?? "#111827";
  const handleLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);
  return (
    <View onLayout={handleLayout} style={styles.canvas}>
      <ScaledView
        contentHeight={height}
        contentWidth={width}
        style={[styles.stage, { backgroundColor, height: renderedHeight, width: renderedWidth }]}
      >
        <SlideCaptureContext.Provider value={captureEnabled ? scale : 0}>
          <FocusStage scale={scale}>{children}</FocusStage>
        </SlideCaptureContext.Provider>
      </ScaledView>
    </View>
  );
}

const styles = StyleSheet.create({
  blockquote: { borderLeftColor: "#64748b", borderLeftWidth: 8, paddingLeft: 32 },
  canvas: { alignItems: "center", flex: 1, justifyContent: "center", overflow: "hidden" },
  code: { backgroundColor: "#1e293b", color: "#e2e8f0", fontFamily: "Menlo", fontSize: 30 },
  emphasis: { fontStyle: "italic" },
  h1: { color: "#f8fafc", fontSize: 88, fontWeight: "700", marginBottom: 36 },
  h2: { color: "#f8fafc", fontSize: 64, fontWeight: "700", marginBottom: 28 },
  h3: { color: "#f8fafc", fontSize: 48, fontWeight: "600", marginBottom: 20 },
  link: { color: "#60a5fa", textDecorationLine: "underline" },
  list: { gap: 16, marginVertical: 20 },
  listItem: { color: "#e2e8f0", fontSize: 40, lineHeight: 56 },
  paragraph: { color: "#e2e8f0", fontSize: 40, lineHeight: 56, marginBottom: 20 },
  pre: { backgroundColor: "#0f172a", borderRadius: 20, padding: 28 },
  slideContent: { flex: 1, justifyContent: "center", paddingHorizontal: 120, paddingVertical: 80 },
  strong: { fontWeight: "700" },
  stage: { overflow: "hidden" },
});
