import type { ReactNode } from "react";
import { Fragment, useMemo } from "react";
import { View } from "react-native";

import { Panel, PanelGroup, ResizeHandle } from "@/components/ResizablePanels";
import { getMusicLayoutLeafDefinition } from "@/layout/MusicLayoutRegistry";
import type { MusicLayoutNode } from "@/layout/MusicLayoutState";

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
        return (
            <PanelGroup direction={node.direction} className="flex-1 min-h-0 min-w-0">
                {children.map((child, index) => {
                    const panelId = getPanelId(path, child, index);
                    const isLast = index === children.length - 1;
                    return (
                        <Fragment key={getNodeKey(child, index)}>
                            <Panel id={panelId} minSize={80} defaultSize={200} order={index} flex={isLast}>
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
