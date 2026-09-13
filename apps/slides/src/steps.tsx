import { Children, cloneElement, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
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
  const { at, until, initial, states, transition } = props;
  const target = useMemo(() => stepStyle(stepIndex, { at, until, initial, states, transition }), [stepIndex, at, until, initial, states, transition]);
  const [progress] = useState(() => new Animated.Value(1));
  let [range, setRange] = useState(() => ({ from: target, to: target }));
  if (range.to !== target) {
    range = { from: range.to, to: target };
    setRange(range);
  }
  useEffect(() => {
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
  const animatedStyle = isPreview || props.transition === "none" ? target : interpolate(range.from, target);

  const hidden = target.opacity === 0;
  return <Animated.View accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    pointerEvents={hidden ? "none" : "auto"} style={animatedStyle}>{props.children}</Animated.View>;
}

type StepsProps = {
  children?: ReactNode | ((step: number) => ReactNode);
  /** Total states including the initial state. Render functions default to two. */
  count?: number;
  transition?: Transition;
};

function getStateCount(count: number | undefined) {
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    throw new Error("Steps count must be a positive integer including the initial state.");
  }
  return count ?? 2;
}

export function Steps({ children }: StepsProps) {
  const { stepIndex } = useSlideLifecycle();
  return <View>{typeof children === "function" ? children(stepIndex) : children}</View>;
}

// Resolve in document order before rendering, independent of mount order or window.
export function resolveSteps(children: ReactNode, listTypes: unknown[] = ["ul", "ol"]) {
  let cursor = 0;
  let maximum = 0;
  function visit(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement<StepProps & { count?: number }>(node)) return node;
      if (node.type === Steps) {
        if (typeof node.props.children === "function") {
          // Do not execute the callback while discovering steps: it can contain
          // arbitrary content. Its explicit count owns these navigation states.
          const last = getStateCount(node.props.count) - 1;
          cursor = Math.max(cursor, last);
          maximum = Math.max(maximum, last);
          return node;
        }
        if (node.props.count !== undefined) {
          maximum = Math.max(maximum, getStateCount(node.props.count) - 1);
        }
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
      return cloneElement(node, props, visit(props.children));
    });
  }
  const content = visit(children);
  return { content, steps: maximum + 1 };
}
