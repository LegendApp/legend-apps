import { SplitView } from "@legendapp/spark/ui/split-view";
import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { Platform, View } from "react-native";

import { MusicSplitView } from "../components/MusicSplitView";
import { Panel, PanelGroup, ResizeHandle } from "../components/ResizablePanels";
import { settings$ } from "../systems/Settings";
import { getMusicLayoutLeafDefinition } from "./MusicLayoutRegistry";
import type { MusicLayoutDirection, MusicLayoutNode } from "./MusicLayoutState";

const MIN_PANE_SIZE = 80;
const DEFAULT_PANE_SIZE = 200;

export interface MusicLayoutRenderContext {
    benchmarkElapsedSeconds?: number;
}

interface MusicLayoutRendererProps {
    context?: MusicLayoutRenderContext;
    node: MusicLayoutNode;
}

interface RenderNodeProps {
    context: MusicLayoutRenderContext;
    node: MusicLayoutNode;
    path: string;
}

function hasExplicitChildren(node: MusicLayoutNode): boolean {
    return Object.prototype.hasOwnProperty.call(node, "children");
}

function getNodeKey(node: MusicLayoutNode, index: number): string {
    if (node.type === "leaf") {
        return `${index}-${node.id}`;
    }
    return `${index}-${node.id ?? node.type}`;
}

function getPanelId(parentPath: string, child: MusicLayoutNode, index: number): string {
    const childId = child.type === "leaf" ? child.id : child.id ?? child.type;
    return `${parentPath}.${index}.${childId}`;
}

function getSplitPaneIds(path: string, children: MusicLayoutNode[], direction: MusicLayoutDirection) {
    if (direction === "vertical") return children.map((child, index) => getPanelId(path, child, index));

    // Keep the settings paths from the chain of horizontal sidebar splits.
    const last = children.length - 1;
    return children.map((child, index) => {
        const groupPath = path + ".rest".repeat(Math.min(index, last - 1));
        return getPanelId(groupPath, child, index === last ? 1 : 0);
    });
}

function renderChildren(children: MusicLayoutNode[] | undefined, context: MusicLayoutRenderContext, path: string) {
    return children?.map((child, index) => (
        <RenderNode
            key={getNodeKey(child, index)}
            context={context}
            node={child}
            path={`${path}.${index}`}
        />
    ));
}

function HorizontalSplit({ context, node, path }: RenderNodeProps) {
    const children = node.children ?? [];
    if (children.length < 2) return <>{renderChildren(children, context, path)}</>;
    const panelId = getPanelId(path, children[0], 0);
    return <MusicSplitView id={panelId}
        sidebar={<RenderNode context={context} node={children[0]} path={panelId} />}
        content={children.length === 2
            ? <RenderNode context={context} node={children[1]} path={getPanelId(path, children[1], 1)} />
            : <HorizontalSplit context={context} node={{ ...node, children: children.slice(1) }} path={`${path}.rest`} />}
    />;
}

function NativeLayoutSplit({ nodes, context, direction, paneIds }: {
    nodes: MusicLayoutNode[];
    context: MusicLayoutRenderContext;
    direction: MusicLayoutDirection;
    paneIds: string[];
}) {
    const [initialSizes] = useState(() => paneIds.slice(0, -1).map(id => {
        const savedSize = settings$.state.panels[id].peek();
        return Number.isFinite(savedSize) ? Math.max(MIN_PANE_SIZE, savedSize) : DEFAULT_PANE_SIZE;
    }));

    return (
        <SplitView
            orientation={direction}
            style={{ flex: 1, minWidth: 0, minHeight: 0 }}
            panes={paneIds.map((id, index) => ({
                id,
                minSize: MIN_PANE_SIZE,
                initialSize: initialSizes[index],
                content: <RenderNode context={context} node={nodes[index]} path={id} />,
            }))}
            onResize={sizes => {
                if (sizes.length !== paneIds.length || sizes.some(size => !Number.isFinite(size) || size < MIN_PANE_SIZE)) return;
                settings$.state.panels.assign(Object.fromEntries(paneIds.slice(0, -1).map((id, index) => [id, sizes[index]])));
            }}
        />
    );
}

function RenderNode({ context, node, path }: RenderNodeProps) {
    if (node.type === "stack") {
        const isHorizontal = node.direction === "horizontal";
        return (
            <View className={isHorizontal ? "flex-1 min-h-0 min-w-0 flex-row" : "flex-1 min-h-0 min-w-0 flex-col"}>
                {renderChildren(node.children, context, path)}
            </View>
        );
    }

    if (node.type === "split") {
        const children = node.children ?? [];
        if (Platform.OS === "macos") {
            if (children.length < 2) return <>{renderChildren(children, context, path)}</>;
            const paneIds = getSplitPaneIds(path, children, node.direction);
            return (
                <NativeLayoutSplit
                    key={JSON.stringify([node.direction, paneIds])}
                    nodes={children}
                    context={context}
                    direction={node.direction}
                    paneIds={paneIds}
                />
            );
        }
        if (node.direction === "horizontal") return <HorizontalSplit context={context} node={node} path={path} />;
        return (
            <PanelGroup direction={node.direction} className="flex-1 min-h-0 min-w-0">
                {children.map((child, index) => {
                    const panelId = getPanelId(path, child, index);
                    const isLast = index === children.length - 1;
                    return (
                        <Fragment key={getNodeKey(child, index)}>
                            <Panel id={panelId} minSize={MIN_PANE_SIZE} defaultSize={DEFAULT_PANE_SIZE} order={index} flex={isLast}>
                                <RenderNode context={context} node={child} path={panelId} />
                            </Panel>
                            {!isLast ? <ResizeHandle panelId={panelId} /> : null}
                        </Fragment>
                    );
                })}
            </PanelGroup>
        );
    }

    if (node.type === "leaf") {
        const definition = getMusicLayoutLeafDefinition(node.id);
        const children = hasExplicitChildren(node)
            ? node.children
            : definition.defaultLayout
              ? [definition.defaultLayout]
              : undefined;
        const renderedChildren = renderChildren(children, context, path);

        return definition.render({ children: renderedChildren, context, node });
    }

    return null;
}

export function MusicLayoutRenderer({ context, node }: MusicLayoutRendererProps) {
    const renderContext = useMemo(() => context ?? {}, [context]);
    return <RenderNode context={renderContext} node={node} path="root" />;
}

export type MusicLayoutRenderedChildren = ReactNode;
