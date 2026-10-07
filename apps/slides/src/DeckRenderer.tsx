import { titleAnimationSpeedSetting, useBackgroundIntensitySetting } from "./slidesSettings";
import { useResolveClassNames } from "uniwind";
import { useValue } from "@legendapp/state/react";
import {
  useRuntimeProjection,
  usePresentationValue,
  Background,
  FocusRegion,
  SharedElement,
  FocusStage,
  PresentationCanvasScaleContext,
  normalizeTransition,
  BackgroundHost,
  useBackgroundHost,
  useHasBackground,
  PresentationObservableProvider,
  renderNativeChildren,
  type CompiledDeckProps,
  type CompiledSlideProps,
  type DeckConfig,
  type PresentationTemplateProps,
  type SlideConfig,
} from "@legend-apps/presentation";
import { ScaledView } from "@legend-apps/scaled-view";
import React, { Children, createContext, isValidElement, useContext, useEffect, type ComponentProps, type ReactElement, type ReactNode } from "react";
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
import { normalizeStepCount, getSlidesState, nextSlide, previousSlide, reportSlideError, setCurrentSlide, setSlidesState, slidesState$ } from "./slidesStore";
import { ContentErrorBoundary } from "./ContentErrorBoundary";
import { Layout, LayoutStage } from "./Layout";
import { SlideSurface } from "./SlideSurface";
import { Step, Steps, countSteps, resolveSteps } from "./steps";
import { CodeBlock } from "./CodeBlock";
import { LiquidGlass } from "./LiquidGlass";
import { Effect } from "./Effect";
import { TypeGPUShader } from "./TypeGPUShader";
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

const DeckRenderContext = createContext<{ isPreview: boolean; isPreparing?: boolean; isOutgoing?: boolean; targetIndex?: number; targetStep?: number }>({ isPreview: false });

function Deck({ children, configJson }: CompiledDeckProps) {
  const { isPreview, isPreparing, isOutgoing, targetIndex, targetStep } = useContext(DeckRenderContext);
  const templates = useValue(slidesState$.templates);
  const elements = Children.toArray(children).filter(isValidElement) as ReactElement<CompiledSlideProps>[];
  const parsedConfig = parseObject<DeckConfig>(configJson, {});
  const config = { ...parsedConfig, transition: normalizeTransition(parsedConfig.transition) };
  const slides = elements.map((element) => ({
    metadata: (() => {
      const parsed = parseObject<SlideConfig>(element.props.metadataJson, {});
      return { ...parsed, steps: Math.max(countSteps(element.props.children, [markdownComponents.ul, markdownComponents.ol]), typeof parsed.steps === "number" ? parsed.steps : 1), transition: normalizeTransition(parsed.transition) };
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

  const runtime$ = useRuntimeProjection(() => {
    const count = slidesState$.slides.length;
    const slideIndex = Math.max(0, Math.min(targetIndex ?? slidesState$.currentSlide.get(), count - 1));
    const stepCount = normalizeStepCount(slidesState$.slides[slideIndex].metadata.steps.get());
    // Fixed previews and retained outgoing surfaces ignore later navigation.
    const currentSlide = isPreview ? slideIndex : isOutgoing ? slidesState$.currentSlide.peek() : slidesState$.currentSlide.get();
    const currentStep = isPreview || isOutgoing ? targetStep ?? 0 : slidesState$.currentStep.get();
    return {
      currentSlide, currentStep, goTo: setCurrentSlide,
      titleAnimationSpeed: titleAnimationSpeedSetting.get(),
      isActive: !isPreview && !isOutgoing && slideIndex === currentSlide,
      isPreview: Boolean(isPreview), isPreparing,
      playbackPhase: isPreparing ? "preparing" : isOutgoing ? "outgoing" : isPreview ? "preview" : slideIndex === currentSlide ? "playing" : "paused",
      next: nextSlide, previous: previousSlide,
      slideCount: count, slideIndex, stepCount,
      stepIndex: Math.max(0, Math.min(targetStep ?? (slideIndex === currentSlide ? currentStep : 0), stepCount - 1)),
      startedAt: isPreview || isOutgoing ? undefined : slidesState$.slideStartedAt.get(),
      stepStartedAt: isPreview || isOutgoing ? undefined : slidesState$.stepStartedAt.get(),
      stepEpochs: isPreview || isOutgoing ? undefined : slidesState$.stepEpochs.get(),
      direction: isPreview || isOutgoing ? undefined : slidesState$.direction.get(),
    };
  }, [isPreview, isPreparing, isOutgoing, targetIndex, targetStep]);
  const selected = elements[selectedIndex];
  if (!selected) return null;
  const selectedMetadata = slides[selectedIndex].metadata;
  const background = selectedMetadata.background ?? config.background;
  const resolvedTemplate = resolveSlideTemplate(templates, config, selectedMetadata);
  const Template = resolvedTemplate.component;
  const content = renderMdxChildren(resolveSteps(selected.props.children, [markdownComponents.ul, markdownComponents.ol]).content);
  return (
    <PresentationObservableProvider value={runtime$}>
      <SlideErrorBoundary index={selectedIndex} isPreview={isPreview}>
        {background !== undefined && <Background>
          {background !== false && <Image source={{ uri: background }} resizeMode="cover" style={StyleSheet.absoluteFill} />}
        </Background>}
        {resolvedTemplate.reference && !Template
          ? <MissingSlideTemplate reference={resolvedTemplate.reference} />
          : Template
          ? <Template deck={config} slide={selectedMetadata}>{content}</Template>
          : <View style={styles.slideContent}>{content}</View>}
      </SlideErrorBoundary>
    </PresentationObservableProvider>
  );
}

type MarkdownTextProps = { children?: ReactNode; style?: StyleProp<TextStyle>; className?: string; inline?: boolean };
function MarkdownText({ children, style, className = "", inline = false }: MarkdownTextProps) {
  const classStyle = useResolveClassNames(className);
  const color = useValue(() => inline ? undefined : slidesState$.config.theme.color.get());
  const fontFamily = useValue(() => inline ? undefined : slidesState$.config.theme.fontFamily.get());
  const themeStyle = {
    ...(color ? { color } : {}),
    ...(!inline && fontFamily ? { fontFamily } : {}),
  };
  return <Text style={[style, themeStyle, classStyle]}>{children}</Text>;
}

function MarkdownLink({ children, href }: { children?: ReactNode; href?: string }) {
  if (containsImage(children)) return <Pressable onPress={() => href && void Linking.openURL(href)}>{children}</Pressable>;
  return <MarkdownText inline style={styles.link}><Text onPress={() => href && void Linking.openURL(href)}>{children}</Text></MarkdownText>;
}

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [loaded, setLoaded] = React.useState({ src, ratio: 16 / 9 });
  return <Image source={{ uri: src }} accessibilityLabel={alt} resizeMode="contain"
    style={{ width: "100%", aspectRatio: loaded.src === src ? loaded.ratio : 16 / 9, marginVertical: 16 }}
    onLoad={event => {
      const { width, height } = event.nativeEvent.source;
      if (width > 0 && height > 0) setLoaded({ src, ratio: width / height });
    }} />;
}

function containsImage(node: ReactNode): boolean {
  return Children.toArray(node).some(child => isValidElement<{ children?: ReactNode }>(child)
    && (child.type === MarkdownImage || containsImage(child.props.children)));
}

function MarkdownParagraph(props: MarkdownTextProps) {
  if (!containsImage(props.children)) return <MarkdownText {...props} style={styles.paragraph} />;
  // Native images need a block layout, rather than percentage sizes inside Text.
  const blocks: ReactNode[] = [];
  let inline: ReactNode[] = [];
  const flush = () => {
    if (inline.length) blocks.push(<MarkdownText key={blocks.length} className={props.className} style={styles.paragraph}>{inline}</MarkdownText>);
    inline = [];
  };
  Children.forEach(props.children, child => {
    if (containsImage(child)) { flush(); blocks.push(<React.Fragment key={blocks.length}>{child}</React.Fragment>); }
    else inline.push(child);
  });
  flush();
  return <View>{blocks}</View>;
}

function MarkdownListItem({ children, marker = "•" }: { children?: ReactNode; marker?: string }) {
  return <View style={{ flexDirection: "row", gap: 16 }}>
    <MarkdownText style={styles.listItem}>{marker}</MarkdownText>
    <NativeView style={{ flex: 1 }}>{renderNativeChildren(children, text => <MarkdownText style={styles.listItem}>{text}</MarkdownText>)}</NativeView>
  </View>;
}

function MarkdownCell({ children, align, heading = false }: { children?: ReactNode; align?: "left" | "center" | "right"; heading?: boolean }) {
  return <View style={{ flex: 1, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "#64748b" }}>
    <MarkdownText style={[styles.paragraph, { marginBottom: 0, textAlign: align }, heading && styles.strong]}>{children}</MarkdownText>
  </View>;
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
  return <MarkdownText inline style={styles.code}>{children}</MarkdownText>;
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
  Layout,
  Deck,
  Background,
  FocusRegion,
  SharedElement,
  SlideSurface,
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
  TypeGPUShader,
  Webview,
  h1: (props: MarkdownTextProps) => <MarkdownText {...props} style={styles.h1} />,
  h2: (props: MarkdownTextProps) => <MarkdownText {...props} style={styles.h2} />,
  h3: (props: MarkdownTextProps) => <MarkdownText {...props} style={styles.h3} />,
  h4: (props: MarkdownTextProps) => <MarkdownText {...props} style={styles.h3} />,
  h5: (props: MarkdownTextProps) => <MarkdownText {...props} style={styles.h3} />,
  h6: (props: MarkdownTextProps) => <MarkdownText {...props} style={styles.h3} />,
  p: MarkdownParagraph,
  img: MarkdownImage,
  del: ({ children }: { children?: ReactNode }) => <MarkdownText inline style={{ textDecorationLine: "line-through" }}>{children}</MarkdownText>,
  table: NativeView,
  thead: NativeView,
  tbody: NativeView,
  tr: ({ children }: { children?: ReactNode }) => <NativeView style={{ flexDirection: "row" }}>{children}</NativeView>,
  td: MarkdownCell,
  th: (props: ComponentProps<typeof MarkdownCell>) => <MarkdownCell {...props} heading />,
  input: ({ checked }: { checked?: boolean }) => <Text accessibilityRole="checkbox" accessibilityState={{ checked, disabled: true }}>{checked ? "☑" : "☐"} </Text>,
  hr: () => <View style={{ height: 2, backgroundColor: "#64748b", marginVertical: 20 }} />,
  strong: ({ children }: { children?: ReactNode }) => <MarkdownText inline style={styles.strong}>{children}</MarkdownText>,
  em: ({ children }: { children?: ReactNode }) => <MarkdownText inline style={styles.emphasis}>{children}</MarkdownText>,
  code: MarkdownCode,
  pre: MarkdownPre,
  blockquote: ({ children }: { children?: ReactNode }) => <NativeView style={styles.blockquote}>{children}</NativeView>,
  ul: ({ children }: { children?: ReactNode }) => <NativeView style={styles.list}>{children}</NativeView>,
  ol: ({ children }: { children?: ReactNode }) => <NativeView style={styles.list}>{children}</NativeView>,
  li: MarkdownListItem,
  a: MarkdownLink,
};

export function DeckRenderer({
  isPreview = false,
  isPreparing = false,
  isOutgoing = false,
  targetIndex,
  targetStep,
}: {
  isPreview?: boolean;
  isPreparing?: boolean;
  isOutgoing?: boolean;
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
    <DeckRenderContext.Provider value={{ isPreview, isPreparing, isOutgoing, targetIndex, targetStep }}>
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

function BackgroundErrorBoundary({ children }: { children?: ReactNode }) {
  const index = usePresentationValue("slideIndex");
  const isPreview = usePresentationValue("isPreview");
  const revision = useValue(slidesState$.revision);
  const retry = useValue(slidesState$.retryRevision);
  return <ContentErrorBoundary resetKey={`${revision}:${retry}:${index}`}
    fallback={<View className="flex-1 items-center justify-center"><Text style={styles.paragraph}>Background unavailable</Text></View>}
    onError={error => reportSlideError(error, index, isPreview)}>{children}</ContentErrorBoundary>;
}

export function SlideBackgroundHost(props: ComponentProps<typeof BackgroundHost>) {
  return <BackgroundHost {...props} boundary={BackgroundErrorBoundary} />;
}

export function SlideCanvas({ children, captureEnabled = true, targetIndex, isPreview = false, backgroundIsPreview = isPreview }: { children: ReactNode; captureEnabled?: boolean; targetIndex?: number; isPreview?: boolean; backgroundIsPreview?: boolean }) {
  const intensity = useBackgroundIntensitySetting();
  const hosted = useBackgroundHost();
  const selectedIndex = useValue(() => targetIndex ?? slidesState$.currentSlide.get());
  const color = useValue(() => slidesState$.config.theme.backgroundColor.get() ?? "#111827");
  const content = <SlideCanvasContent captureEnabled={captureEnabled} warnLayout={isPreview}>{children}</SlideCanvasContent>;
  return hosted ? content : <SlideBackgroundHost intensity={intensity} slideIndex={selectedIndex} color={color} isPreview={backgroundIsPreview}>{content}</SlideBackgroundHost>;
}

function SlideCanvasContent({ children, captureEnabled, warnLayout }: { children: ReactNode; captureEnabled: boolean; warnLayout: boolean }) {
  const hasBackground = useHasBackground();
  const aspect = useValue(slidesState$.config.aspectRatio);
  const configuredWidth = useValue(slidesState$.config.width);
  const configuredHeight = useValue(slidesState$.config.height);
  const color = useValue(() => hasBackground ? "transparent" : slidesState$.config.theme.backgroundColor.get() ?? "#111827");
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const aspectParts = aspect?.split(/[/:]/).map(Number) ?? [];
  const aspectRatio = aspectParts.length === 2 && aspectParts.every((value) => Number.isFinite(value) && value > 0)
    ? aspectParts[0] / aspectParts[1]
    : 16 / 9;
  const width = configuredWidth ?? 1920;
  const height = configuredHeight ?? width / aspectRatio;
  const scale = Math.min(size.width / width || 0, size.height / height || 0);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const backgroundColor = color;
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => current.width === width && current.height === height ? current : { width, height });
  };
  return (
    <View onLayout={handleLayout} style={styles.canvas}>
      <ScaledView
        contentHeight={height}
        contentWidth={width}
        style={[styles.stage, { backgroundColor, height: renderedHeight, width: renderedWidth }]}
      >
        <SlideCaptureContext.Provider value={captureEnabled ? scale : 0}>
          <PresentationCanvasScaleContext.Provider value={scale}>
            <FocusStage scale={scale}><LayoutStage width={width} height={height} warn={warnLayout}>{children}</LayoutStage></FocusStage>
          </PresentationCanvasScaleContext.Provider>
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
  h1: { textAlign: "center", color: "#f8fafc", fontSize: 88, fontWeight: "700", marginBottom: 36 },
  h2: { textAlign: "center", color: "#f8fafc", fontSize: 64, fontWeight: "700", marginBottom: 28 },
  h3: { textAlign: "center", color: "#f8fafc", fontSize: 48, fontWeight: "600", marginBottom: 20 },
  link: { color: "#60a5fa", textDecorationLine: "underline" },
  list: { gap: 16, marginVertical: 20 },
  listItem: { color: "#e2e8f0", fontSize: 40, lineHeight: 56 },
  paragraph: { color: "#e2e8f0", fontSize: 40, lineHeight: 56, marginBottom: 20 },
  pre: { backgroundColor: "#0f172a", borderRadius: 20, padding: 28 },
  slideContent: { flex: 1, justifyContent: "center", paddingHorizontal: 120, paddingVertical: 80 },
  strong: { fontWeight: "700" },
  stage: { overflow: "hidden" },
});
