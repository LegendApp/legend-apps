import { type DropEvent, DragDropView } from "@legendapp/spark/drag-drop";
import { type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { type ReactNode, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type DiffOpenSource } from "../diffFiles";
import { diffMergeSaveConflictKey } from "../diffMergeControls";
import { useDiffShowStatisticsPanelSetting } from "../diffSettings";
import { GlassToast } from "../GlassToast";
import { parseDiffSearchQuery } from "../viewer/diffSearch";
import { DiffNativeMenuController } from "../viewer/diffViewerControllers";
import { type DiffFatalError, type DiffRecoverableError, useDiffViewerModel } from "../viewer/diffViewerModel";
import { sourcesMatch } from "../viewer/diffViewerSupport";
import { styles } from "./diffWindowStyles";

const diffStatNumberFormatter = new Intl.NumberFormat("en-US");
const diffUnsavedMergeBannerHeight = 48;
export function DiffErrorPanel({ borderColor, error, foregroundColor, mutedColor, onChooseFolder, chooseFolderLabel = "Choose Folder", onDismiss, onOpenExternalUrl, onOpenSystemSettings, onRetry, surfaceColor, }: {
    borderColor: string;
    chooseFolderLabel?: string;
    error: DiffRecoverableError | DiffFatalError;
    foregroundColor: string;
    mutedColor: string;
    onChooseFolder?: () => void;
    onDismiss?: () => void;
    onOpenExternalUrl?: (url: string) => void;
    onOpenSystemSettings?: () => void;
    onRetry?: () => void;
    surfaceColor: string;
}) {
    const recoverySteps = "recoverySteps" in error ? error.recoverySteps : undefined;
    const externalUrl = "externalUrl" in error ? error.externalUrl : undefined;
    const externalUrlLabel = ("externalUrlLabel" in error ? error.externalUrlLabel : undefined) ?? "Open in Browser";
    const canOpenExternalUrl = Boolean(onOpenExternalUrl && externalUrl);
    return (<View style={[styles.errorPanel, { backgroundColor: surfaceColor, borderColor }]}>
      <View style={styles.errorPanelBody}>
        <Text style={[styles.errorPanelTitle, { color: foregroundColor }]}>
          {error.title}
        </Text>
        <Text style={[styles.errorPanelMessage, { color: mutedColor }]} numberOfLines={3}>
          {error.message}
        </Text>
        {recoverySteps ? (<View style={styles.errorPanelSteps}>
            {recoverySteps.map((step, index) => (<Text key={step} style={[styles.errorPanelStep, { color: mutedColor }]}>
                {index + 1}. {step}
              </Text>))}
          </View>) : null}
        {onRetry || canOpenExternalUrl || onOpenSystemSettings || onChooseFolder || onDismiss ? (<View style={styles.errorPanelActions}>
            {onRetry ? (<Pressable accessibilityRole="button" onPress={onRetry} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>Retry</Text>
              </Pressable>) : null}
            {onOpenExternalUrl && externalUrl ? (<Pressable accessibilityRole="button" onPress={() => onOpenExternalUrl(externalUrl)} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>{externalUrlLabel}</Text>
              </Pressable>) : null}
            {onOpenSystemSettings ? (<Pressable accessibilityRole="button" onPress={onOpenSystemSettings} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>Open System Settings</Text>
              </Pressable>) : null}
            {onChooseFolder ? (<Pressable accessibilityRole="button" onPress={onChooseFolder} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>{chooseFolderLabel}</Text>
              </Pressable>) : null}
            {onDismiss ? (<Pressable accessibilityRole="button" onPress={onDismiss} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: mutedColor }]}>Dismiss</Text>
              </Pressable>) : null}
          </View>) : null}
      </View>
    </View>);
}
export function DiffDocumentErrorBody({ borderColor, documentError, foregroundColor, mutedColor, onDismiss, onOpenExternalUrl, onOpenSystemSettings, onRetry, surfaceColor, }: {
    borderColor: string;
    documentError: DiffRecoverableError | null;
    foregroundColor: string;
    mutedColor: string;
    onDismiss: () => void;
    onOpenExternalUrl: (url: string) => void;
    onOpenSystemSettings: () => void;
    onRetry: () => boolean;
    surfaceColor: string;
}) {
    return documentError ? (<View style={styles.documentError}>
      <DiffErrorPanel borderColor={borderColor} chooseFolderLabel={documentError.kind === "permission" ? "Choose Another Folder" : undefined} error={documentError} foregroundColor={foregroundColor} mutedColor={mutedColor} onDismiss={onDismiss} onOpenExternalUrl={onOpenExternalUrl} onOpenSystemSettings={documentError.kind === "permission" ? onOpenSystemSettings : undefined} onRetry={documentError.kind !== "permission" && documentError.source ? onRetry : undefined} surfaceColor={surfaceColor}/>
    </View>) : null;
}
function DiffUnsavedMergeDraftBanner({ dangerColor, disabled, fileCount, onDiscard, onSave, primaryColor, }: {
    dangerColor: string;
    disabled: boolean;
    fileCount: number;
    onDiscard: () => void;
    onSave: () => void;
    primaryColor: string;
}) {
    const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
    return (<GlassToast actions={[
            { disabled, label: "Discard", onPress: onDiscard },
            {
                color: primaryColor, disabled, label: "Save", onPress: onSave, variant: "primary",
                minWidth: 56
            },
        ]} style={styles.unsavedMergeBanner} tintColor={`${dangerColor}24`} title={`Unsaved merge resolutions - ${fileLabel}`}/>);
}
export function DiffUnsavedMergeDraftBannerWithSavingState({ dangerColor, fileCount, onDiscard, onSave, primaryColor, resolvingMergeConflictKeys$, }: {
    dangerColor: string;
    fileCount: number;
    onDiscard: () => void;
    onSave: () => void;
    primaryColor: string;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
}) {
    const isSavingMergeDrafts = useValue(() => resolvingMergeConflictKeys$.get().has(diffMergeSaveConflictKey));
    return (<DiffUnsavedMergeDraftBanner dangerColor={dangerColor} disabled={isSavingMergeDrafts} fileCount={fileCount} onDiscard={onDiscard} onSave={onSave} primaryColor={primaryColor}/>);
}
export function DiffNativeMenuSavingStateController({ hasUnsavedMergeDrafts, resolvingMergeConflictKeys$, }: {
    hasUnsavedMergeDrafts: boolean;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
}) {
    const isSavingMergeDrafts = useValue(() => resolvingMergeConflictKeys$.get().has(diffMergeSaveConflictKey));
    return (<DiffNativeMenuController hasUnsavedMergeDrafts={hasUnsavedMergeDrafts} isSavingMergeDrafts={isSavingMergeDrafts}/>);
}
export function DiffFatalBody({ borderColor, error, foregroundColor, mutedColor, onChooseFolder, surfaceColor, }: {
    borderColor: string;
    error: DiffFatalError;
    foregroundColor: string;
    mutedColor: string;
    onChooseFolder: () => void;
    surfaceColor: string;
}) {
    return (<View style={styles.empty}>
      <DiffErrorPanel borderColor={borderColor} error={error} foregroundColor={foregroundColor} mutedColor={mutedColor} onChooseFolder={onChooseFolder} surfaceColor={surfaceColor}/>
    </View>);
}
export function DiffNoChangesBody({ foregroundColor, mutedColor, visibleSourceLabel, }: {
    foregroundColor: string;
    mutedColor: string;
    visibleSourceLabel: string;
}) {
    return (<View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
        No changes
      </Text>
      <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
        {visibleSourceLabel}
      </Text>
    </View>);
}
export function DiffDownloadingBody({ foregroundColor, mutedColor, source, }: {
    foregroundColor: string;
    mutedColor: string;
    source: DiffOpenSource;
}) {
    return (<View accessibilityLabel={`Downloading diff for ${source.label}`} accessibilityRole="progressbar" style={styles.downloadingBody}>
      <ActivityIndicator color={foregroundColor} size="small"/>
      <Text style={[styles.loadingTitle, { color: foregroundColor }]}>Downloading diff…</Text>
      <Text numberOfLines={1} style={[styles.loadingDetail, { color: mutedColor }]}>{source.label}</Text>
    </View>);
}
export function DiffProgressiveLoadingBanner({ foregroundColor, mutedColor, source, surfaceColor, }: {
    foregroundColor: string;
    mutedColor: string;
    source: DiffOpenSource;
    surfaceColor: string;
}) {
    const { loadProgress$ } = useDiffViewerModel();
    const progress = useValue(loadProgress$);
    const visible = source.kind === "github" &&
        progress.visible &&
        progress.source !== null &&
        sourcesMatch(progress.source, source);
    return visible ? (<View pointerEvents="none" style={styles.progressiveLoadingBanner}>
      <View accessibilityLabel={`Downloading changes, ${formatStatNumber(progress.fileCount)} files, ${formatStatNumber(progress.rowCount)} lines`} accessibilityRole="progressbar" style={[styles.progressiveLoadingSurface, { backgroundColor: surfaceColor }]}>
        <ActivityIndicator color={foregroundColor} size="small"/>
        <View style={styles.progressiveLoadingText}>
          <Text style={[styles.loadingTitle, { color: foregroundColor }]}>Downloading…</Text>
          <Text style={[styles.loadingDetail, { color: mutedColor }]}>
            {formatStatNumber(progress.fileCount)} files · {formatStatNumber(progress.rowCount)} lines
          </Text>
        </View>
      </View>
    </View>) : null;
}
export function DiffDropSurface({ backgroundColor, borderColor, children, foregroundColor, mutedColor, onDropDiff, syntaxAppearance, }: {
    backgroundColor: string;
    borderColor: string;
    children: ReactNode;
    foregroundColor: string;
    mutedColor: string;
    onDropDiff: (event: DropEvent) => void;
    syntaxAppearance: "dark" | "light";
}) {
    const [isDropTargetActive, setIsDropTargetActive] = useState(false);
    const handleDragEnter = useCallback(() => {
        setIsDropTargetActive(true);
    }, []);
    const handleDragLeave = useCallback(() => {
        setIsDropTargetActive(false);
    }, []);
    const handleDrop = useCallback((event: DropEvent) => {
        setIsDropTargetActive(false);
        onDropDiff(event);
    }, [onDropDiff]);
    return (<DragDropView acceptedTypes={["files", "urls", "text"]} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop} style={[styles.root, { backgroundColor }]}>
      {children}
      {isDropTargetActive ? (<View pointerEvents="none" style={[
                styles.dropOverlay,
                {
                    backgroundColor: syntaxAppearance === "dark" ? "rgba(88, 166, 255, 0.14)" : "rgba(9, 105, 218, 0.12)",
                    borderColor,
                },
            ]}>
          <Text style={[styles.dropOverlayTitle, { color: foregroundColor }]}>
            Open Diff
          </Text>
          <Text style={[styles.dropOverlayText, { color: mutedColor }]}>
            Drop a folder, .diff file, or two files
          </Text>
        </View>) : null}
    </DragDropView>);
}
function formatStatNumber(value: number) {
    return diffStatNumberFormatter.format(Math.max(0, Math.floor(value)));
}
function formatStatTime(value: number) {
    return `${Math.max(0, value).toFixed(1)} ms`;
}
export function DiffStatisticsPanel({ borderColor, foregroundColor, mutedColor, syntaxAppearance, }: {
    borderColor: string;
    foregroundColor: string;
    mutedColor: string;
    syntaxAppearance: "dark" | "light";
}) {
    const showStatisticsPanel = useDiffShowStatisticsPanelSetting();
    const { loadStatistics$, state$, } = useDiffViewerModel();
    const state = useValue(state$);
    const statistics = useValue(loadStatistics$);
    if (!showStatisticsPanel || state.status !== "loaded" || !statistics) {
        return null;
    }
    const rows = state.document.rowCount;
    const files = state.files.length;
    const loadComplete = state.loadComplete !== false;
    const panelBackgroundColor = syntaxAppearance === "dark" ? "rgba(16, 20, 26, 0.92)" : "rgba(255, 255, 255, 0.94)";
    return (<View pointerEvents="none" style={[
            styles.statisticsPanel,
            {
                backgroundColor: panelBackgroundColor,
                borderColor,
            },
        ]}>
      <Text style={[styles.statisticsTitle, { color: foregroundColor }]}>
        Statistics
      </Text>
      <View style={styles.statisticsRows}>
        {statistics.downloadMs > 0 ? (<View style={styles.statisticsRow}>
            <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Download</Text>
            <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatTime(statistics.downloadMs)}</Text>
          </View>) : null}
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Initial UI paint</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatTime(statistics.firstPaintMs)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Native/session total</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatTime(statistics.nativeTotalMs)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Files</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatNumber(files)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Rows</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatNumber(rows)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>State</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{loadComplete ? "Complete" : "Loading"}</Text>
        </View>
      </View>
    </View>);
}
export function DiffSearchStatusPanel({ borderColor, foregroundColor, mutedColor, syntaxAppearance, }: {
    borderColor: string;
    foregroundColor: string;
    mutedColor: string;
    syntaxAppearance: "dark" | "light";
}) {
    const { searchQuery$, searchResults$, activeSearchResultIndex$ } = useDiffViewerModel();
    const query = parseDiffSearchQuery(useValue(searchQuery$));
    const resultCount = useValue(() => searchResults$.get().length);
    const activeResultIndex = useValue(activeSearchResultIndex$);
    if (!query.term) {
        return null;
    }
    const panelBackgroundColor = syntaxAppearance === "dark" ? "rgba(16, 20, 26, 0.92)" : "rgba(255, 255, 255, 0.94)";
    const label = query.mode === "file" ? "Files" : "Matches";
    const summary = resultCount > 0
        ? `${Math.min(activeResultIndex + 1, resultCount)} of ${resultCount}`
        : "No results";
    return (<View pointerEvents="none" style={[
            styles.searchStatusPanel,
            {
                backgroundColor: panelBackgroundColor,
                borderColor,
            },
        ]}>
      <Text style={[styles.searchStatusLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[styles.searchStatusValue, { color: foregroundColor }]}>{summary}</Text>
    </View>);
}
export function DiffCompareRefPrompt({ backgroundColor, borderColor, foregroundColor, mutedColor, onCancel, onSubmit, }: {
    backgroundColor: string;
    borderColor: string;
    foregroundColor: string;
    mutedColor: string;
    onCancel: () => void;
    onSubmit: () => void;
}) {
    const { compareRefPromptVisible$, compareRefInput$ } = useDiffViewerModel();
    const visible = useValue(compareRefPromptVisible$);
    const value = useValue(compareRefInput$);
    if (!visible)
        return null;
    return (<View style={styles.compareRefPromptOverlay}>
      <Pressable accessibilityLabel="Cancel compare ref" onPress={onCancel} style={StyleSheet.absoluteFill}/>
      <View style={[styles.compareRefPrompt, { backgroundColor, borderColor }]}>
        <Text style={[styles.compareRefPromptTitle, { color: foregroundColor }]}>Compare Against</Text>
        <TextInput autoFocus onChangeText={compareRefInput$.set} onSubmitEditing={onSubmit} placeholder="Branch, tag, commit, or ref" placeholderTextColor={mutedColor} returnKeyType="go" selectionColor={foregroundColor} style={[styles.compareRefPromptInput, { borderColor, color: foregroundColor }]} value={value}/>
        <View style={styles.compareRefPromptActions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.compareRefPromptButton, { borderColor }]}>
            <Text style={[styles.compareRefPromptButtonText, { color: foregroundColor }]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSubmit} style={[styles.compareRefPromptButton, { borderColor }]}>
            <Text style={[styles.compareRefPromptButtonText, { color: foregroundColor }]}>Compare</Text>
          </Pressable>
        </View>
      </View>
    </View>);
}
