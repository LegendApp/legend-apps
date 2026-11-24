import {
  clampSplitFraction,
  collapsePaneRect,
  findSplit,
  getPanePlacement,
  type PaneFrame,
  type PaneNode,
  type PaneRect,
  type SplitFrame,
} from "@legend-apps/workspace";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, PanResponder, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";

/** Silica's pane glide: 300 ms that settles without overshoot. */
export const paneAnimationDuration = 300;
const paneEasing = Easing.bezier(0.25, 0.1, 0.25, 1);
const cardRadius = 10;
const doubleClickMs = 350;
// react-native-macos draws these cursors; the shared React Native types only list auto and pointer.
const resizeCursors = {
  horizontal: "col-resize" as unknown as ViewStyle["cursor"],
  vertical: "row-resize" as unknown as ViewStyle["cursor"],
};

export type MarkdownPaneAreaProps = {
  /** False while a divider drags, so panes follow the pointer without easing. */
  animate: boolean;
  cardColor: string;
  frames: PaneFrame[];
  hairlineColor: string;
  onResize: (splitId: string, fraction: number, animate: boolean) => void;
  onSizeChange: (size: { height: number; width: number }) => void;
  renderPane: (paneId: string, frame: PaneFrame) => ReactNode;
  root: PaneNode;
  splits: SplitFrame[];
  tabBarHeight: number;
};

/**
 * Lifts a pane card off the window's page color, which also tints the glass chrome: near white in light
 * themes, slightly lighter in dark ones, so the cards read as solid sheets on the glass.
 */
export function getPaneCardColor(background: string, appearance: "dark" | "light") {
  const hex = /^#([0-9a-f]{6})$/i.exec(background)?.[1];
  if (!hex) return background;
  const amount = appearance === "light" ? 0.75 : 0.05;
  return `#${[0, 2, 4].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16);
    return Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0");
  }).join("")}`;
}

type LeavingPane = { from: PaneFrame; id: string; to: PaneRect };

/**
 * Lays document panes out as rounded cards over the window's glass. Split, close and even-out glide;
 * a new pane grows from its outer edge and a closing one shrinks back into it.
 */
export function MarkdownPaneArea({ animate, cardColor, frames, hairlineColor, onResize, onSizeChange, renderPane, root, splits, tabBarHeight }: MarkdownPaneAreaProps) {
  const previous = useRef<{ frames: PaneFrame[]; root: PaneNode } | null>(null);
  // Closing panes render in the same commit that removes them, so they shrink from where they were.
  const leaving = useRef<LeavingPane[]>([]);
  const [, expire] = useState(0);
  const before = previous.current;
  // Only a layout change glides; a window resize or a divider drag moves the cards directly.
  const glide = animate && !!before && before.root !== root;
  const enterFrom = new Map<string, PaneRect>();
  if (before && glide) {
    for (const frame of frames) {
      const placement = getPanePlacement(root, frame.id);
      if (placement && !before.frames.some(old => old.id === frame.id)) enterFrom.set(frame.id, collapsePaneRect(frame, placement));
    }
    for (const old of before.frames) {
      const placement = getPanePlacement(before.root, old.id);
      if (placement && !frames.some(frame => frame.id === old.id) && !leaving.current.some(pane => pane.id === old.id)) {
        leaving.current = [...leaving.current, { from: old, id: old.id, to: collapsePaneRect(old, placement) }];
      }
    }
  }
  previous.current = { frames, root };
  const leavingCount = leaving.current.length;
  useEffect(() => {
    if (leavingCount === 0) return;
    const timeout = setTimeout(() => {
      leaving.current = [];
      expire(count => count + 1);
    }, paneAnimationDuration);
    return () => clearTimeout(timeout);
  }, [leavingCount]);

  return (
    <View onLayout={(event: LayoutChangeEvent) => onSizeChange(event.nativeEvent.layout)} style={styles.area} testID="markdown-pane-area">
      {leaving.current.map(pane => (
        <AnimatedRect animate enterFrom={pane.from} key={`leaving-${pane.id}`} rect={pane.to}>
          {() => <View style={[styles.card, { backgroundColor: cardColor, borderColor: hairlineColor, marginTop: tabBarHeight }]} />}
        </AnimatedRect>
      ))}
      {frames.map(frame => (
        <AnimatedRect animate={glide} enterFrom={enterFrom.get(frame.id)} key={frame.id} rect={frame}>
          {content => renderPane(frame.id, { ...frame, ...content })}
        </AnimatedRect>
      ))}
      {splits.map(split => (
        <SplitDivider key={split.id} onResize={onResize} root={root} split={split} />
      ))}
    </View>
  );
}

/**
 * A pane's tab row on the glass above its card: solid page color, 10 pt continuous corners, a hairline and a
 * soft shadow. The card follows the animated frame while the content keeps the final `frame` size, so the
 * editor lays out once per change rather than on every animation frame.
 */
export function MarkdownPaneChrome({ cardColor, children, frame, hairlineColor, tabBar, tabBarHeight }: {
  cardColor: string;
  children: ReactNode;
  frame: PaneRect;
  hairlineColor: string;
  tabBar: ReactNode;
  tabBarHeight: number;
}) {
  return (
    <>
      <View style={[styles.tabRow, { height: tabBarHeight }]}>
        <View style={{ height: tabBarHeight, width: frame.width }}>{tabBar}</View>
      </View>
      <View style={[styles.card, { backgroundColor: cardColor, borderColor: hairlineColor }]}>
        <View style={styles.cardClip}>
          <View style={[styles.pane, { height: Math.max(0, frame.height - tabBarHeight), width: frame.width }]}>{children}</View>
        </View>
      </View>
    </>
  );
}

function sameRect(a: PaneRect, b: PaneRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Glides a pane between frames. During a glide its content keeps the size it was laid out at and re-lays
 * out once when the glide ends: an editor reflowing at a new width holds the JS thread, which drives the glide.
 */
function AnimatedRect({ animate, children, enterFrom, rect }: { animate: boolean; children: (content: PaneRect) => ReactNode; enterFrom?: PaneRect; rect: PaneRect }) {
  const [values] = useState(() => {
    const start = enterFrom ?? rect;
    return { height: new Animated.Value(start.height), width: new Animated.Value(start.width), x: new Animated.Value(start.x), y: new Animated.Value(start.y) };
  });
  const laidOut = useRef(rect);
  const glidingTo = useRef<PaneRect | null>(null);
  const [, settle] = useState(0);
  if (animate && !sameRect(laidOut.current, rect)) glidingTo.current = rect;
  const gliding = glidingTo.current !== null && sameRect(glidingTo.current, rect);
  if (!gliding) laidOut.current = rect;
  const { height, width, x, y } = rect;
  // A glide already running keeps going when a later render stops asking for one.
  const animateRef = useRef(animate);
  animateRef.current = animate;
  useEffect(() => {
    const targets = { height, width, x, y };
    const keys = Object.keys(targets) as (keyof typeof targets)[];
    if (!animateRef.current) {
      keys.forEach(key => values[key].setValue(targets[key]));
      return;
    }
    const animation = Animated.parallel(keys.map(key => Animated.timing(values[key], {
      duration: paneAnimationDuration,
      easing: paneEasing,
      toValue: targets[key],
      // Frames are layout props, which the native driver cannot animate.
      useNativeDriver: false,
    })));
    animation.start(({ finished }) => {
      // A glide stopped for a newer one leaves the content to that one.
      if (!finished || !glidingTo.current) return;
      glidingTo.current = null;
      settle(count => count + 1);
    });
    return () => animation.stop();
  }, [height, values, width, x, y]);
  return (
    <Animated.View style={[styles.rect, { height: values.height, left: values.x, top: values.y, width: values.width }]}>
      {children(laidOut.current)}
    </Animated.View>
  );
}

function SplitDivider({ onResize, root, split }: { onResize: MarkdownPaneAreaProps["onResize"]; root: PaneNode; split: SplitFrame }) {
  const latest = useRef({ onResize, root, split });
  latest.current = { onResize, root, split };
  const drag = useRef({ fraction: 0.5, lastRelease: 0, moved: false });
  const [responder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      drag.current.fraction = findSplit(latest.current.root, latest.current.split.id)?.fraction ?? 0.5;
      drag.current.moved = false;
    },
    onPanResponderMove: (_event, gesture) => {
      const { onResize: resize, root: tree, split: frame } = latest.current;
      const node = findSplit(tree, frame.id);
      if (!node) return;
      const horizontal = frame.axis === "horizontal";
      const delta = horizontal ? gesture.dx : gesture.dy;
      if (Math.abs(delta) < 1 && !drag.current.moved) return;
      drag.current.moved = true;
      const size = horizontal ? frame.width : frame.height;
      const gap = horizontal ? 6 : 0;
      resize(frame.id, clampSplitFraction(node, size, drag.current.fraction + delta / (size + gap)), false);
    },
    onPanResponderRelease: () => {
      const now = Date.now();
      if (!drag.current.moved && now - drag.current.lastRelease < doubleClickMs) {
        const { onResize: resize, root: tree, split: frame } = latest.current;
        const node = findSplit(tree, frame.id);
        if (node) resize(frame.id, clampSplitFraction(node, frame.axis === "horizontal" ? frame.width : frame.height, 0.5), true);
        drag.current.lastRelease = 0;
        return;
      }
      drag.current.lastRelease = drag.current.moved ? 0 : now;
    },
  }));
  const { divider } = split;
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={split.axis === "horizontal" ? "Resize panes side by side" : "Resize stacked panes"}
      style={[styles.divider, { cursor: resizeCursors[split.axis], height: divider.height, left: divider.x, top: divider.y, width: divider.width }]}
    />
  );
}

const styles = StyleSheet.create({
  area: {
    flex: 1,
  },
  card: {
    borderCurve: "continuous",
    borderRadius: cardRadius,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    shadowColor: "#000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardClip: {
    borderCurve: "continuous",
    borderRadius: cardRadius,
    flex: 1,
    overflow: "hidden",
  },
  divider: {
    position: "absolute",
    zIndex: 1,
  },
  pane: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  rect: {
    position: "absolute",
  },
  tabRow: {
    overflow: "hidden",
  },
});
