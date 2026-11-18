import { Fragment, type ReactNode } from "react";
import { PlatformColor, StyleSheet, View } from "react-native";
import type { PanelId } from "../settings/schema";
import { planPanels, type RenderPlan } from "./plan";

/** Renders one panel instance; `id` is its instance id (the panel id unless the layout names it). */
export type PanelRenderer = (instance: { id: string; options?: Record<string, unknown> }) => ReactNode;
export type PanelRenderers = Partial<Record<PanelId, PanelRenderer>>;

/**
 * Lays out a render plan (spec §5.4). Until Spark has a general SplitView (ask S1) nested splits are fixed-size flex
 * panes: a pane with a `size` gets that many points along the axis (at least `minSize`; in a column, more when its
 * content is taller), the others share the rest; no divider is draggable. Panes are keyed by panel instance id, so a layout edit that keeps a panel keeps it mounted.
 */
export function LayoutHost({ plan, panels, onFocusPanel }: { plan: RenderPlan; panels: PanelRenderers; onFocusPanel?: (id: string) => void }) {
  return <PlanNode plan={plan} panels={panels} onFocusPanel={onFocusPanel} />;
}

function PlanNode({ plan, panels, onFocusPanel }: { plan: RenderPlan; panels: PanelRenderers; onFocusPanel?: (id: string) => void }): ReactNode {
  if (plan.type === "panel") {
    return <View style={styles.fill} testID={`panel:${plan.id}`}
      // Capture without claiming the responder: the pane under the pointer becomes the focused pane for Move Pane.
      onStartShouldSetResponderCapture={() => { onFocusPanel?.(plan.id); return false; }}>
      {panels[plan.panel]?.({ id: plan.id, options: plan.options }) ?? null}
    </View>;
  }
  const row = plan.direction === "row";
  return <View style={[styles.fill, row ? styles.row : styles.column]}>
    {plan.children.map((child, index) => {
      // A split is keyed by the panels it holds, so moving it among its siblings keeps everything inside mounted.
      const key = child.plan.type === "panel" ? child.plan.id : `split:${planPanels(child.plan).join("|")}`;
      const minimum = child.minSize ?? 0;
      // A sized pane keeps its width; in a column it also grows to its content's height (the composer's controls).
      const style = child.size === undefined ? [styles.flexible, row ? { minWidth: minimum, maxWidth: child.maxSize } : { minHeight: minimum, maxHeight: child.maxSize }]
        : row ? { flexBasis: child.size, flexGrow: 0, flexShrink: 1, minWidth: minimum, maxWidth: child.maxSize }
        : { flexGrow: 0, flexShrink: 0, minHeight: Math.max(child.size, minimum), maxHeight: child.maxSize };
      return <Fragment key={key}>
        {index > 0 ? <View style={row ? styles.dividerVertical : styles.dividerHorizontal} /> : null}
        <View style={[style, styles.clip]}>
          <PlanNode plan={child.plan} panels={panels} onFocusPanel={onFocusPanel} />
        </View>
      </Fragment>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  // An auto basis lets a sized column pane measure its content; the pane still shrinks it to fit.
  fill: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 0, minHeight: 0 },
  row: { flexDirection: "row" },
  column: { flexDirection: "column" },
  flexible: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  clip: { overflow: "hidden" },
  dividerVertical: { width: StyleSheet.hairlineWidth, backgroundColor: PlatformColor("separatorColor") },
  dividerHorizontal: { height: StyleSheet.hairlineWidth, backgroundColor: PlatformColor("separatorColor") },
});
