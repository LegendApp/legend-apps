import {
  PresentationProvider,
  type CompiledDeckProps,
  type CompiledSlideProps,
  type DeckConfig,
  type SlideConfig,
  type SlideTransition,
} from "@legend-apps/presentation";
import React, { Children, isValidElement, useEffect, type ReactElement, type ReactNode } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { getSlidesState, nextSlide, previousSlide, setCurrentSlide, setSlidesState, useSlidesState } from "./slidesStore";

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

function normalizeTransition(value: unknown): SlideTransition | undefined {
  return value === "none" || value === "fade" || value === "slide" ? value : undefined;
}

function Deck({ children, configJson, targetIndex, isPreview }: CompiledDeckProps & { targetIndex?: number; isPreview?: boolean }) {
  const elements = Children.toArray(children).filter(isValidElement) as ReactElement<CompiledSlideProps>[];
  const parsedConfig = parseObject<DeckConfig>(configJson, {});
  const config = { ...parsedConfig, transition: normalizeTransition(parsedConfig.transition) };
  const slides = elements.map((element) => ({
    metadata: (() => {
      const parsed = parseObject<SlideConfig>(element.props.metadataJson, {});
      return { ...parsed, transition: normalizeTransition(parsed.transition) };
    })(),
    notes: element.props.notes,
  }));
  const selectedIndex = Math.max(0, Math.min(targetIndex ?? getSlidesState().currentSlide, elements.length - 1));

  useEffect(() => {
    const current = getSlidesState();
    if (JSON.stringify(current.config) !== JSON.stringify(config) || JSON.stringify(current.slides) !== JSON.stringify(slides)) {
      setSlidesState({ config, currentSlide: Math.min(current.currentSlide, Math.max(0, slides.length - 1)), slides });
    }
  }, [configJson, elements.length]);

  const selected = elements[selectedIndex];
  if (!selected) {
    return null;
  }
  return (
    <PresentationProvider value={{
      currentSlide: getSlidesState().currentSlide,
      goTo: setCurrentSlide,
      isActive: !isPreview && selectedIndex === getSlidesState().currentSlide,
      isPreview: Boolean(isPreview),
      next: nextSlide,
      previous: previousSlide,
      slideCount: elements.length,
      slideIndex: selectedIndex,
    }}>
      {selected.props.children}
    </PresentationProvider>
  );
}

function MarkdownText({ children, style }: { children?: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useSlidesState((state) => state.config.theme);
  const themeStyle = {
    ...(theme?.color ? { color: theme.color } : {}),
    ...(theme?.fontFamily ? { fontFamily: theme.fontFamily } : {}),
  };
  return <Text style={[style, themeStyle]}>{children}</Text>;
}

function MarkdownLink({ children, href }: { children?: ReactNode; href?: string }) {
  return <MarkdownText style={styles.link}><Text onPress={() => href && void Linking.openURL(href)}>{children}</Text></MarkdownText>;
}

const markdownComponents = {
  Deck,
  Slide,
  View,
  Text,
  Image,
  Pressable,
  h1: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.h1}>{children}</MarkdownText>,
  h2: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.h2}>{children}</MarkdownText>,
  h3: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.h3}>{children}</MarkdownText>,
  p: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.paragraph}>{children}</MarkdownText>,
  strong: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.strong}>{children}</MarkdownText>,
  em: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.emphasis}>{children}</MarkdownText>,
  code: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.code}>{children}</MarkdownText>,
  pre: ({ children }: { children?: ReactNode }) => <View style={styles.pre}>{children}</View>,
  blockquote: ({ children }: { children?: ReactNode }) => <View style={styles.blockquote}>{children}</View>,
  ul: ({ children }: { children?: ReactNode }) => <View style={styles.list}>{children}</View>,
  ol: ({ children }: { children?: ReactNode }) => <View style={styles.list}>{children}</View>,
  li: ({ children }: { children?: ReactNode }) => <MarkdownText style={styles.listItem}>• {children}</MarkdownText>,
  a: MarkdownLink,
};

export function DeckRenderer({ isPreview = false, targetIndex }: { isPreview?: boolean; targetIndex?: number }) {
  const Component = useSlidesState((state) => state.component);
  const revision = useSlidesState((state) => state.revision);
  if (!Component) {
    return null;
  }
  return <Component components={{ ...markdownComponents, Deck: (props: CompiledDeckProps) => <Deck {...props} isPreview={isPreview} targetIndex={targetIndex} /> }} key={`${revision}:${targetIndex ?? "current"}:${isPreview}`} />;
}

export function SlideCanvas({ children }: { children: ReactNode }) {
  const config = useSlidesState((state) => state.config);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const aspectParts = config.aspectRatio?.split(/[/:]/).map(Number) ?? [];
  const aspectRatio = aspectParts.length === 2 && aspectParts.every((value) => Number.isFinite(value) && value > 0)
    ? aspectParts[0] / aspectParts[1]
    : 16 / 9;
  const width = config.width ?? 1920;
  const height = config.height ?? width / aspectRatio;
  const scale = Math.min(size.width / width || 0, size.height / height || 0);
  const handleLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);
  return (
    <View onLayout={handleLayout} style={[styles.canvas, { backgroundColor: config.theme?.backgroundColor ?? "#111827" }]}>
      <View style={{ width, height, transform: [{ scale }] }}>{children}</View>
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
  strong: { fontWeight: "700" },
});
