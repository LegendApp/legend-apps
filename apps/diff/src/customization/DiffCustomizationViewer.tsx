import { useValue } from "@legendapp/state/react";
import { useWindowId, WindowProvider } from "@legendapp/spark/windows";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import DiffViewerWindow, { type DiffViewerWindowProps } from "../DiffViewerWindow";
import { DiffWindowLifecycle } from "../DiffWindowLifecycle";
import { getSavedDiffWindows } from "../diffAppMetadata";
import { diffCustomization, confirmDiffCustomizationPreviewMounted, diffCustomizationPreviewWindowId, failDiffCustomizationPreview,
  getDiffCustomizationComponent, getDiffCustomizationSampleSource } from "./diffCustomizationRuntime";

class CustomizationErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode; preview: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (this.props.preview) failDiffCustomizationPreview(error);
    diffCustomization.reportRuntimeError(error, this.props.preview);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function DiffCustomizationViewer(props: DiffViewerWindowProps) {
  useValue(diffCustomization.state$.history.activeId);
  const ready = useValue(diffCustomization.state$.ready);
  const windowId = useWindowId();
  const version = ready ? diffCustomization.activeVersion() : null;
  const lastVersion = useRef(version?.id);
  const latestSource = useRef(props.source);
  if (lastVersion.current !== version?.id) {
    lastVersion.current = version?.id;
    latestSource.current = getSavedDiffWindows().find(window => window.id === windowId)?.source ?? props.source;
  }
  const source = latestSource.current;
  return <>
    <DiffWindowLifecycle onClose={props.onClose} />
    <CustomizationErrorBoundary key={version?.id ?? "original"} preview={false} fallback={<DiffViewerWindow {...props} source={source} />}>
      <CustomizedViewer version={version} props={{ ...props, source }} />
    </CustomizationErrorBoundary>
  </>;
}

function CustomizedViewer({ version, props, preview = false }: {
  version: Parameters<typeof getDiffCustomizationComponent>[0]; props: DiffViewerWindowProps; preview?: boolean;
}) {
  const Viewer = getDiffCustomizationComponent(version, preview) ?? DiffViewerWindow;
  return <Viewer {...props} />;
}

function PreviewContent() {
  const preview = useValue(diffCustomization.state$.preview);
  const status = useValue(diffCustomization.state$.status);
  const [sample, setSample] = useState(true);
  const [source] = useState(getDiffCustomizationSampleSource);
  useEffect(() => { if (preview) confirmDiffCustomizationPreviewMounted(); }, [preview?.id]);
  return <View className="flex-1 bg-surface">
    <View className="flex-row items-center justify-between border-b border-border-primary px-4 py-3">
      <Text className="text-sm text-text-primary">{preview?.title ?? "Preview closed"}</Text>
      <View className="flex-row gap-4">
        <Pressable accessibilityRole="button" className="min-h-8 justify-center px-2" onPress={() => setSample(value => !value)}><Text className="text-sm text-text-primary">{sample ? "Show Start Screen" : "Show Sample Diff"}</Text></Pressable>
        <Pressable accessibilityRole="button" className="min-h-8 justify-center px-2" disabled={status === "applying"} onPress={() => { void diffCustomization.revert(); }}><Text className="text-sm text-text-primary">Revert</Text></Pressable>
        <Pressable accessibilityRole="button" className="min-h-8 justify-center px-2" disabled={status !== "idle"} onPress={() => { void diffCustomization.keep(); }}><Text className="text-sm font-semibold text-text-primary">{status === "applying" ? "Applying…" : status === "idle" ? "Keep" : "Preparing…"}</Text></Pressable>
      </View>
    </View>
    {preview ? <CustomizationErrorBoundary key={`${preview.id}:${sample}`} preview fallback={<Text className="p-4 text-danger">The preview failed. Your saved app is unchanged.</Text>}>
      <CustomizedViewer version={preview} preview props={{ source: sample ? source : undefined, windowIdentifier: diffCustomizationPreviewWindowId }} />
    </CustomizationErrorBoundary> : null}
  </View>;
}

export function DiffCustomizationPreviewWindow() {
  return <WindowProvider id={diffCustomizationPreviewWindowId}>
    <DiffWindowLifecycle onClose={() => { void diffCustomization.revert(); }} />
    <PreviewContent />
  </WindowProvider>;
}
