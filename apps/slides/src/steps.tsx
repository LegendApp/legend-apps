import Animated from "react-native-reanimated";
import { useStepStyle } from "./useStepStyle";
import { Children, cloneElement, isValidElement, useMemo, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { SceneMotionView, usePresentationValue } from "@legend-apps/presentation";

type Transition = "fade" | "fade-up" | "slide-up" | "none" | { duration?: number };
type StepProps = {
  children?: ReactNode;
  at?: number;
  reveal?: "fade" | "fade-up" | "zoom" | "none";
  duration?: number;
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

function MarkdownReveal({ children, at = 0, until, reveal = "fade", duration = 450 }: StepProps) {
  const step = usePresentationValue("stepIndex");
  const visible = step >= at && (until === undefined || step < until);
  return <SceneMotionView pointerEvents="auto" hidden={!visible} duration={reveal === "none" ? 0 : duration}
    pose={{ opacity: visible ? 1 : 0, y: reveal === "fade-up" && !visible ? 24 : 0,
      scaleX: reveal === "zoom" && !visible ? 0.94 : 1, scaleY: reveal === "zoom" && !visible ? 0.94 : 1 }}>
    {children}
  </SceneMotionView>;
}

export function Step(props: StepProps) {
  return props.reveal !== undefined ? <MarkdownReveal {...props} /> : <LegacyStep {...props} />;
}

function LegacyStep(props: StepProps) {
  const stepIndex = usePresentationValue("stepIndex");
  const { at, until, initial, states, transition } = props;
  const target = useMemo(() => stepStyle(stepIndex, { at, until, initial, states, transition }), [stepIndex, at, until, initial, states, transition]);
  const duration = transition === "none" ? 0 : typeof transition === "object" ? transition.duration ?? 300 : 300;
  const animatedStyle = useStepStyle(target, duration);

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
  const stepIndex = usePresentationValue("stepIndex");
  return <View>{typeof children === "function" ? children(stepIndex) : children}</View>;
}

// Resolve in document order before rendering, independent of mount order or window.
export function resolveSteps(children: ReactNode, listTypes: unknown[] = ["ul", "ol"]) {
  return walkSteps(children, listTypes, true);
}

/** Discover navigation states without allocating a replacement React tree. */
export function countSteps(children: ReactNode, listTypes: unknown[] = ["ul", "ol"]) {
  return walkSteps(children, listTypes, false).steps;
}

function walkSteps(children: ReactNode, listTypes: unknown[], render: boolean) {
  let cursor = 0;
  let maximum = 0;
  function visit(nodes: ReactNode): ReactNode {
    const visitor = (node: ReactNode): ReactNode => {
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
        if (!render) {
          for (const child of items) {
            maximum = Math.max(maximum, ++cursor);
            visit(child);
          }
          return node;
        }
        return cloneElement(node, {}, items.map((child, index) => visit(
          <Step key={index} transition={node.props.transition}>{child}</Step>,
        )));
      }
      let props = node.props;
      if (node.type === Step) {
        const at = props.at ?? (props.states ? 0 : cursor + 1);
        cursor = Math.max(cursor, at, ...Object.keys(props.states ?? {}).map(Number), props.until ?? 0);
        maximum = Math.max(maximum, cursor);
        if (render) props = { ...props, at };
      }
      const content = visit(props.children);
      return render ? cloneElement(node, props, content) : node;
    };
    if (render) return Children.map(nodes, visitor);
    Children.forEach(nodes, visitor);
    return nodes;
  }
  const content = visit(children);
  return { content, steps: maximum + 1 };
}
