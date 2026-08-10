import { NativeSegmentedControl } from "@legend-apps/native-select";
import { SFSymbol } from "@legend-apps/sf-symbol";
import type { RefObject, ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { RecentDiffSource } from "../diffAppMetadata";
import { getDiffFolderCompareBaseKey, normalizeDiffOpenSource, type DiffOpenSource } from "../diffFiles";
import {
  diffRecentFilters,
  formatRecentDiffSourceOpenedAt,
  getFilteredRecentDiffSources,
  getRecentDiffSourceDetail,
  getRecentDiffSourceKind,
  type DiffRecentFilter,
} from "./diffStartScreenModel";

const diffStartScreenMaxContentWidth = 1080;
const diffStartScreenBrandTitlebarHeight = 76;
const diffStartScreenSectionGap = 48;
const diffStartScreenAccentColor = "#1f396f";
const diffStartScreenControlBackgroundColor = "rgba(26, 27, 30, 0.72)";
const diffStartScreenControlBorderColor = "rgba(255, 255, 255, 0.10)";
const diffStartScreenShortcutBackgroundColor = "rgba(255, 255, 255, 0.10)";
const folderAccentColor = "#2f93ff";
const pullRequestAccentColor = "#a970ff";
const commitAccentColor = "#62d66f";
const filePairAccentColor = "#d08c3f";
const diffFileAccentColor = "#4fb8a8";
const diffAppIcon = require("../../macos/legendapp-shell-macos/Assets.xcassets/AppIcon.appiconset/icon_128x128.png");
const diffStartHeroImage = require("./diff-start-hero.png");
const diffStartHeroAspectRatio = 1458 / 304;
export type DiffStartScreenProps = {
  backgroundColor: string;
  borderColor: string;
  dangerColor: string;
  foregroundColor: string;
  isLoading: boolean;
  loadingSource: DiffOpenSource | null;
  mutedColor: string;
  onChangeUrlInput: (text: string) => void;
  onChooseFolder: () => void;
  onCompareFiles: () => void;
  onOpenRecentSource: (source: DiffOpenSource) => void;
  onOpenUrl: () => void | Promise<void>;
  openErrorBody: ReactNode;
  recentFilter: DiffRecentFilter;
  recentSources: RecentDiffSource[];
  setRecentFilter: (filter: DiffRecentFilter) => void;
  sidebarBackgroundColor: string;
  urlInput: string;
  urlInputError: string | null;
  urlInputRef: RefObject<TextInput | null>;
};

function getSourceIconName(source: DiffOpenSource) {
  const kind = getRecentDiffSourceKind(source);
  if (kind === "folder") {
    return "folder";
  }
  if (kind === "commit") {
    return "smallcircle.filled.circle";
  }
  if (kind === "filePair") {
    return "doc.on.doc";
  }
  if (kind === "diffFile") {
    return "doc.text";
  }
  return "point.3.connected.trianglepath.dotted";
}

function getSourceAccentColor(source: DiffOpenSource, mutedColor: string) {
  const kind = getRecentDiffSourceKind(source);
  if (kind === "folder") {
    return folderAccentColor;
  }
  if (kind === "pullRequest") {
    return pullRequestAccentColor;
  }
  if (kind === "commit") {
    return commitAccentColor;
  }
  if (kind === "filePair") {
    return filePairAccentColor;
  }
  if (kind === "diffFile") {
    return diffFileAccentColor;
  }
  return mutedColor;
}

function DiffStartScreenHero({ borderColor }: { borderColor: string }) {
  return (
    <View
      accessibilityLabel="Drag or Paste to Compare. Drop or paste folders, GitHub URLs, .diff files, or two files."
      accessibilityRole="image"
      style={[styles.heroBanner, { borderColor }]}
    >
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={diffStartHeroImage}
        style={styles.heroImage}
      />
    </View>
  );
}

function ShortcutPill({
  children,
  color,
}: {
  children: string;
  color: string;
}) {
  return (
    <View style={styles.shortcutPill}>
      <Text style={[styles.shortcutPillText, { color }]}>{children}</Text>
    </View>
  );
}

function sourcesMatch(left: DiffOpenSource | null, right: DiffOpenSource | null) {
  return left !== null &&
    right !== null &&
    left.kind === right.kind &&
    left.value === right.value &&
    (
      left.kind !== "folder" ||
      right.kind !== "folder" ||
      getDiffFolderCompareBaseKey(left.compareBase) === getDiffFolderCompareBaseKey(right.compareBase)
    );
}

function DiffStartScreenRecentRow({
  borderColor,
  foregroundColor,
  isLoading,
  isRowLoading,
  isLastRow,
  mutedColor,
  onOpenSource,
  recentSource,
}: {
  borderColor: string;
  foregroundColor: string;
  isLoading: boolean;
  isRowLoading: boolean;
  isLastRow: boolean;
  mutedColor: string;
  onOpenSource: (source: DiffOpenSource) => void;
  recentSource: RecentDiffSource;
}) {
  const source = recentSource.source;
  const accentColor = getSourceAccentColor(source, mutedColor);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isLoading}
      onPress={() => onOpenSource(source)}
      style={({ pressed }) => [
        styles.recentRow,
        {
          borderBottomColor: borderColor,
          borderBottomWidth: isLastRow ? 0 : StyleSheet.hairlineWidth,
          opacity: isLoading ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={styles.recentRowIcon}>
        <SFSymbol color={accentColor} name={getSourceIconName(source)} size={22} />
      </View>
      <View style={styles.recentRowText}>
        <Text style={[styles.recentRowTitle, { color: foregroundColor }]} numberOfLines={1}>
          {source.label}
        </Text>
        <Text style={[styles.recentRowDetail, { color: mutedColor }]} numberOfLines={1}>
          {getRecentDiffSourceDetail(source)}
        </Text>
      </View>
      <View style={styles.recentRowStatus}>
        {isRowLoading ? (
          <ActivityIndicator color={mutedColor} size="small" />
        ) : (
          <Text style={[styles.recentRowTime, { color: mutedColor }]} numberOfLines={1}>
            {formatRecentDiffSourceOpenedAt(recentSource.lastOpenedAt)}
          </Text>
        )}
      </View>
      <SFSymbol color={mutedColor} name="chevron.right" size={14} />
    </Pressable>
  );
}

function DiffStartScreenRecentList({
  borderColor,
  foregroundColor,
  isLoading,
  loadingSource,
  mutedColor,
  onOpenSource,
  recentSources,
}: {
  borderColor: string;
  foregroundColor: string;
  isLoading: boolean;
  loadingSource: DiffOpenSource | null;
  mutedColor: string;
  onOpenSource: (source: DiffOpenSource) => void;
  recentSources: RecentDiffSource[];
}) {
  return (
    <View style={[styles.recentList, { borderColor }]}>
      {recentSources.map((recentSource, index) => (
        <DiffStartScreenRecentRow
          borderColor={borderColor}
          foregroundColor={foregroundColor}
          isLastRow={index === recentSources.length - 1}
          isLoading={isLoading}
          isRowLoading={sourcesMatch(loadingSource, recentSource.source)}
          key={recentSource.id}
          mutedColor={mutedColor}
          onOpenSource={onOpenSource}
          recentSource={recentSource}
        />
      ))}
    </View>
  );
}

export function DiffStartScreen({
  backgroundColor,
  borderColor,
  dangerColor,
  foregroundColor,
  isLoading,
  loadingSource,
  mutedColor,
  onChangeUrlInput,
  onChooseFolder,
  onCompareFiles,
  onOpenRecentSource,
  onOpenUrl,
  openErrorBody,
  recentFilter,
  recentSources,
  setRecentFilter,
  urlInput,
  urlInputError,
  urlInputRef,
}: DiffStartScreenProps) {
  const filteredRecentSources = getFilteredRecentDiffSources(recentSources, recentFilter);
  const urlInputSource = urlInput.trim() ? normalizeDiffOpenSource(urlInput) : null;
  const isUrlLoading = sourcesMatch(loadingSource, urlInputSource);
  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={styles.brandTitlebar}>
        <View style={styles.brandTitlebarContent}>
          <Image
            accessibilityIgnoresInvertColors
            source={diffAppIcon}
            style={styles.brandIcon}
          />
          <Text style={[styles.brandTitle, { color: foregroundColor }]}>Legend Diff</Text>
        </View>
      </View>
      <ScrollView
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.scroller}
      >
        <View style={styles.startPage}>
          <View style={styles.launcherSection}>
            <DiffStartScreenHero
              borderColor={borderColor}
            />
            <View style={styles.launcherControls}>
              <View style={styles.launcherRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isLoading}
                  onPress={onChooseFolder}
                  style={({ pressed }) => [
                    styles.openFolderButton,
                    {
                      backgroundColor: diffStartScreenAccentColor,
                      opacity: isLoading ? 0.45 : pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <View
                    className="absolute inset-0 bg-gradient-to-r from-[#1f396f] via-[#24437b] to-[#365487]"
                    pointerEvents="none"
                    style={styles.openFolderButtonGradient}
                  />
                  <View style={styles.controlLabel}>
                    <SFSymbol color="#ffffff" name="folder" size={20} />
                    <Text style={styles.openFolderText}>Folder</Text>
                  </View>
                  <ShortcutPill color="rgba(255, 255, 255, 0.88)">⌘O</ShortcutPill>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isLoading}
                  onPress={onCompareFiles}
                  style={({ pressed }) => [
                    styles.compareFilesButton,
                    {
                      borderColor: diffStartScreenControlBorderColor,
                      opacity: isLoading ? 0.45 : pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <View style={styles.controlLabel}>
                    <SFSymbol color={foregroundColor} name="doc.on.doc" size={20} />
                    <Text style={[styles.compareFilesText, { color: foregroundColor }]}>Files</Text>
                  </View>
                  <ShortcutPill color={mutedColor}>⌥⌘O</ShortcutPill>
                </Pressable>
                <View style={[styles.urlField, { borderColor: diffStartScreenControlBorderColor }]}>
                  <SFSymbol color={mutedColor} name="link" size={20} style={styles.urlFieldIcon} />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={onChangeUrlInput}
                    onSubmitEditing={onOpenUrl}
                    placeholder="Paste GitHub URL or path"
                    placeholderTextColor={mutedColor}
                    multiline={false}
                    numberOfLines={1}
                    ref={urlInputRef}
                    returnKeyType="go"
                    style={[styles.urlInput, { color: foregroundColor }]}
                    value={urlInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isLoading || !urlInput.trim()}
                    onPress={onOpenUrl}
                    style={({ pressed }) => [
                      styles.urlOpenButton,
                      {
                        borderColor: diffStartScreenControlBorderColor,
                        opacity: isLoading || !urlInput.trim() ? 0.45 : pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    {isUrlLoading ? (
                      <ActivityIndicator color={foregroundColor} size="small" />
                    ) : (
                      <ShortcutPill color={mutedColor}>⌘↵</ShortcutPill>
                    )}
                  </Pressable>
                </View>
              </View>
              {urlInputError ? (
                <Text style={[styles.validationText, { color: dangerColor }]}>
                  {urlInputError}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.recentSection}>
            {recentSources.length > 0 ? (
              <>
                <View style={styles.recentToolbar}>
                  <Text style={[styles.recentTitle, { color: foregroundColor }]}>Recents</Text>
                  <NativeSegmentedControl
                    onChange={(nextFilter) => setRecentFilter(nextFilter as typeof recentFilter)}
                    segments={diffRecentFilters.map((filter) => ({
                      label: filter.title,
                      value: filter.key,
                    }))}
                    style={styles.segmentedControl}
                    value={recentFilter}
                  />
                </View>
                {filteredRecentSources.length > 0 ? (
                  <DiffStartScreenRecentList
                    borderColor={borderColor}
                    foregroundColor={foregroundColor}
                    isLoading={isLoading}
                    loadingSource={loadingSource}
                    mutedColor={mutedColor}
                    onOpenSource={onOpenRecentSource}
                    recentSources={filteredRecentSources}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
      {openErrorBody ? (
        <View style={styles.openError}>
          {openErrorBody}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brandIcon: {
    borderRadius: 11,
    height: 46,
    width: 46,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: "600",
    lineHeight: 42,
  },
  brandTitlebar: {
    alignItems: "center",
    flexShrink: 0,
    height: diffStartScreenBrandTitlebarHeight,
    justifyContent: "center",
  },
  brandTitlebarContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  compareFilesButton: {
    alignItems: "center",
    backgroundColor: diffStartScreenControlBackgroundColor,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  compareFilesText: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  heroBanner: {
    aspectRatio: diffStartHeroAspectRatio,
    overflow: "hidden",
    width: "100%",
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  controlLabel: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minWidth: 0,
    zIndex: 1,
  },
  launcherRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  launcherSection: {
    gap: 14,
  },
  launcherControls: {
    gap: 10,
  },
  openError: {
    alignItems: "center",
    bottom: 24,
    left: 0,
    paddingHorizontal: 32,
    position: "absolute",
    right: 0,
    zIndex: 10,
  },
  openFolderButton: {
    alignItems: "center",
    borderRadius: 7,
    flexDirection: "row",
    gap: 16,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
    position: "relative",
  },
  openFolderButtonGradient: {
    borderRadius: 7,
    zIndex: 0,
  },
  openFolderText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  recentList: {
    backgroundColor: diffStartScreenControlBackgroundColor,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    overflow: "hidden",
  },
  recentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recentRowDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  recentRowIcon: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  recentRowStatus: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 82,
  },
  recentRowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  recentRowTime: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "right",
  },
  recentRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  root: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: "relative",
  },
  scroller: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: 34,
    paddingHorizontal: 48,
    paddingTop: 16,
  },
  segmentedControl: {
    height: 28,
    width: 360,
  },
  shortcutPill: {
    alignItems: "center",
    backgroundColor: diffStartScreenShortcutBackgroundColor,
    borderRadius: 4,
    height: 22,
    justifyContent: "center",
    minWidth: 35,
    paddingHorizontal: 7,
    shadowColor: "#000000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    zIndex: 1,
  },
  shortcutPillText: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  recentSection: {
    minWidth: 0,
  },
  recentTitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
  },
  recentToolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  startPage: {
    gap: diffStartScreenSectionGap,
    maxWidth: diffStartScreenMaxContentWidth,
    width: "100%",
  },
  urlField: {
    alignItems: "center",
    backgroundColor: diffStartScreenControlBackgroundColor,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flex: 1,
    height: 48,
    minWidth: 0,
    paddingLeft: 14,
  },
  urlFieldIcon: {
    marginRight: 14,
  },
  urlInput: {
    flex: 1,
    fontSize: 15,
    height: 46,
    lineHeight: 20,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  urlOpenButton: {
    alignItems: "center",
    alignSelf: "stretch",
    borderLeftWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  validationText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
