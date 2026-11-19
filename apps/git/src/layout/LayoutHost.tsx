import { useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SplitView } from "@legendapp/spark/ui/split-view";
import { PanelInstanceProvider } from "../settings/panelOptions";
import type { PanelId } from "../settings/schema";
import { isDividerResize, type PaneResize } from "./paneSizes";
import { planPanels, type RenderPlan } from "./plan";

/** Renders one panel instance; `id` is its instance id (the panel id unless the layout names it). */
export type PanelRenderer = (instance: { id: string; options?: Record<string, unknown> }) => ReactNode;
export type PanelRenderers = Partial<Record<PanelId, PanelRenderer>>;

type PlanProps = { plan: RenderPlan; panels: PanelRenderers; onFocusPanel?: (id: string) => void; onPaneResize?: PaneResize };

export function LayoutHost({ plan, ...props }: PlanProps): ReactNode {
  if (plan.type === "panel") {
    return <View style={styles.fill} testID={`panel:${plan.id}`}
      // Capture without claiming the responder: the pane under the pointer becomes the focused pane for Move Pane.
      onStartShouldSetResponderCapture={() => { props.onFocusPanel?.(plan.id); return false; }}>
      <PanelInstanceProvider instance={{ id: plan.id, panel: plan.panel, options: plan.options }}>
        {props.panels[plan.panel]?.({ id: plan.id, options: plan.options }) ?? null}
      </PanelInstanceProvider>
    </View>;
  }
  return <Split plan={plan} {...props} />;
}

function paneId(plan: RenderPlan): string {
  return JSON.stringify(plan.type === "panel" ? ["panel", plan.id] : ["split", ...planPanels(plan).sort()]);
}

function Split({ plan, panels, onFocusPanel, onPaneResize }: Omit<PlanProps, "plan"> & { plan: Extract<RenderPlan, { type: "split" }> }) {
  const previous = useRef<{ order: string; sizes: readonly number[] } | undefined>(undefined);
  const horizontal = plan.direction === "row";
  const ids = plan.children.map(child => paneId(child.plan));
  const order = JSON.stringify([plan.sizeKey, horizontal, ids]);
  return <SplitView
    style={styles.fill}
    testID={`split:${plan.sizeKey}`}
    orientation={horizontal ? "horizontal" : "vertical"}
    dividerStyle="thin"
    panes={plan.children.map((child, index) => {
      const minSize = Math.min(child.maxSize ?? Infinity, child.minSize ?? (horizontal ? 120 : 72));
      return {
        id: ids[index]!,
        content: <LayoutHost plan={child.plan} panels={panels} onFocusPanel={onFocusPanel} onPaneResize={onPaneResize} />,
        minSize,
        maxSize: child.maxSize,
        initialSize: child.size === undefined ? undefined : Math.min(child.maxSize ?? Infinity, Math.max(minSize, child.size)),
      };
    })}
    onResize={sizes => {
      const before = previous.current;
      previous.current = { order, sizes };
      if (before?.order !== order || !isDividerResize(before.sizes, sizes)) return;
      const stored = [...plan.savedSizes ?? []];
      plan.children.forEach(({ index }, pane) => {
        while (stored.length < index) stored.push(0);
        stored[index] = sizes[pane]!;
      });
      onPaneResize?.(plan.sizeKey, stored);
    }}
  />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
});
