import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { useSlideLifecycle } from "@legend-apps/presentation";

type Transition = "fade" | "fade-up" | "slide-up" | "none" | { duration?: number };
type StepProps = {
  children?: ReactNode;
  at?: number;
  until?: number;
  initial?: ViewStyle;
  states?: Record<number, ViewStyle>;
  transition?: Transition;
};

export function stepStyle(step: number, { at = 1, until, initial, states, transition }: StepProps): ViewStyle {
  if (states) {
    return Object.keys(states).map(Number).sort((a, b) => a - b)
      .filter((position) => position <= step)
      .reduce((style, position) => ({ ...style, ...states[position] }), { ...initial });
  }
  const visible = step >= at && (until === undefined || step < until);
  return { opacity: visible ? 1 : 0,
    ...((transition === "fade-up" || transition === "slide-up")
      ? { transform: [{ translateY: visible ? 0 : 24 }] } : {}) };
}

export function Step(props: StepProps) {
  const { stepIndex, isPreview, isActive } = useSlideLifecycle();
  const target = useMemo(() => stepStyle(stepIndex, props), [stepIndex, props.at, props.until, props.initial, props.states, props.transition]);
  const progress = useRef(new Animated.Value(1)).current;
  const previous = useRef(target);
  useEffect(() => {
    previous.current = target;
    if (isPreview || !isActive || props.transition === "none") {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: typeof props.transition === "object" ? props.transition.duration ?? 300 : 300,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [isActive, isPreview, progress, target, props.transition]);
  function interpolate(start: unknown, end: unknown): any {
    if (typeof end === "number" && typeof start === "number") {
      return progress.interpolate({ inputRange: [0, 1], outputRange: [start, end] });
    }
    if (typeof end === "string" && typeof start === "string" && end.startsWith("#") && start.startsWith("#")) {
      return progress.interpolate({ inputRange: [0, 1], outputRange: [start, end] });
    }
    if (Array.isArray(end)) return end.map((value, index) => interpolate(Array.isArray(start) ? start[index] : value, value));
    if (end && typeof end === "object") return Object.fromEntries(Object.entries(end).map(([key, value]) =>
      [key, interpolate(start && typeof start === "object" ? (start as Record<string, unknown>)[key] : value, value)]));
    return end;
  }
  const animatedStyle = isPreview || props.transition === "none" ? target : interpolate(previous.current, target);

  const hidden = target.opacity === 0;
  return <Animated.View accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    pointerEvents={hidden ? "none" : "auto"} style={animatedStyle}>{props.children}</Animated.View>;
}

export function Steps({ children }: { children?: ReactNode; transition?: Transition }) {
  return <View>{children}</View>;
}

// Resolve in document order before rendering, independent of mount order or window.
export function resolveSteps(children: ReactNode, listTypes: unknown[] = ["ul", "ol"]) {
  let cursor = 0;
  let maximum = 0;
  function visit(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement<StepProps & { startOnStep?: number }>(node)) return node;
      if (node.type === Steps) {
        const items = Children.toArray(node.props.children).flatMap((child) => {
          if (isValidElement<{ children?: ReactNode }>(child) && listTypes.includes(child.type)) return Children.toArray(child.props.children);
          return [child];
        }).filter((child) => typeof child !== "string" || child.trim());
        return cloneElement(node, {}, items.map((child, index) => visit(
          <Step key={index} transition={node.props.transition}>{child}</Step>,
        )));
      }
      let props = node.props;
      if (node.type === Step) {
        const at = props.at ?? (props.states ? 0 : cursor + 1);
        cursor = Math.max(cursor, at, ...Object.keys(props.states ?? {}).map(Number), props.until ?? 0);
        maximum = Math.max(maximum, cursor);
        props = { ...props, at };
      }
      maximum = Math.max(maximum, props.startOnStep ?? 0);
      return cloneElement(node, props, visit(props.children));
    });
  }
  const content = visit(children);
  return { content, steps: maximum + 1 };
}
