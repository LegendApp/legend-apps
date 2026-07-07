import { NativeSegmentedControl } from "@legend-desktop/native-select";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import type { RefObject, ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { RecentDiffSource } from "../diffAppMetadata";
import { normalizeDiffOpenSource, type DiffOpenSource } from "../diffFiles";
import {
  diffRecentFilters,
  formatRecentDiffSourceOpenedAt,
  getGroupedRecentDiffSources,
  getRecentDiffSourceDetail,
  getRecentDiffSourceKind,
  type DiffRecentFilter,
  type DiffRecentSourceGroup,
} from "./diffStartScreenModel";

const diffStartScreenMaxContentWidth = 1080;
const diffStartScreenBrandTitlebarHeight = 76;
const diffStartScreenSectionGap = 30;
const diffStartScreenAccentColor = "#426c9f";
const pullRequestAccentColor = "#a970ff";
const commitAccentColor = "#62d66f";
const filePairAccentColor = "#d08c3f";
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
  return "point.3.connected.trianglepath.dotted";
}

function getSourceAccentColor(source: DiffOpenSource, mutedColor: string) {
  const kind = getRecentDiffSourceKind(source);
  if (kind === "folder") {
    return diffStartScreenAccentColor;
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

function sourcesMatch(left: DiffOpenSource | null, right: DiffOpenSource | null) {
  return left !== null && right !== null && left.kind === right.kind && left.value === right.value;
}

function DiffStartScreenRecentRow({
  borderColor,
  foregroundColor,
  isLoading,
  isRowLoading,
  mutedColor,
  onOpenSource,
  recentSource,
}: {
  borderColor: string;
  foregroundColor: string;
  isLoading: boolean;
  isRowLoading: boolean;
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
          borderColor,
          opacity: isLoading ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={styles.recentRowIcon}>
        <SFSymbol color={accentColor} name={getSourceIconName(source)} size={18} />
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
    </Pressable>
  );
}

function DiffStartScreenRecentGroup({
  borderColor,
  foregroundColor,
  group,
  isLoading,
  loadingSource,
  mutedColor,
  onOpenSource,
}: {
  borderColor: string;
  foregroundColor: string;
  group: DiffRecentSourceGroup;
  isLoading: boolean;
  loadingSource: DiffOpenSource | null;
  mutedColor: string;
  onOpenSource: (source: DiffOpenSource) => void;
}) {
  return (
    <View style={styles.recentGroup}>
      <Text style={[styles.recentGroupTitle, { color: mutedColor }]}>
        {group.title} ({group.recentSources.length})
      </Text>
      <View style={[styles.recentGroupList, { borderColor }]}>
        {group.recentSources.map((recentSource) => (
          <DiffStartScreenRecentRow
            borderColor={borderColor}
            foregroundColor={foregroundColor}
            isLoading={isLoading}
            isRowLoading={sourcesMatch(loadingSource, recentSource.source)}
            key={recentSource.id}
            mutedColor={mutedColor}
            onOpenSource={onOpenSource}
            recentSource={recentSource}
          />
        ))}
      </View>
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
  const recentGroups = getGroupedRecentDiffSources(recentSources, recentFilter);
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
                <SFSymbol color="#ffffff" name="folder" size={17} />
                <Text style={styles.openFolderText}>Open Folder</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isLoading}
                onPress={onCompareFiles}
                style={({ pressed }) => [
                  styles.compareFilesButton,
                  {
                    borderColor,
                    opacity: isLoading ? 0.45 : pressed ? 0.72 : 1,
                  },
                ]}
              >
                <SFSymbol color={foregroundColor} name="doc.on.doc" size={16} />
                <Text style={[styles.compareFilesText, { color: foregroundColor }]}>Compare Files</Text>
              </Pressable>
              <View style={[styles.urlField, { borderColor }]}>
                <SFSymbol color={mutedColor} name="link" size={15} />
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
                      borderColor,
                      opacity: isLoading || !urlInput.trim() ? 0.45 : pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  {isUrlLoading ? (
                    <ActivityIndicator color={foregroundColor} size="small" />
                  ) : (
                    <Text style={[styles.urlOpenButtonText, { color: foregroundColor }]}>Open</Text>
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
        <View style={[styles.sectionDivider, { backgroundColor: borderColor }]} />
        <View style={styles.recentSection}>
          {recentSources.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text style={[styles.recentTitle, { color: foregroundColor }]}>Recent</Text>
              </View>
              <NativeSegmentedControl
                onChange={(nextFilter) => setRecentFilter(nextFilter as typeof recentFilter)}
                segments={diffRecentFilters.map((filter) => ({
                  label: filter.title,
                  value: filter.key,
                }))}
                style={styles.segmentedControl}
                value={recentFilter}
              />
              <View style={styles.recentGroups}>
                {recentGroups.map((group) => (
                  <DiffStartScreenRecentGroup
                    borderColor={borderColor}
                    foregroundColor={foregroundColor}
                    group={group}
                    isLoading={isLoading}
                    key={group.key}
                    loadingSource={loadingSource}
                    mutedColor={mutedColor}
                    onOpenSource={onOpenRecentSource}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </View>
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
    height: diffStartScreenBrandTitlebarHeight,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  brandTitlebarContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  compareFilesButton: {
    alignItems: "center",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    height: 60,
    justifyContent: "center",
    minWidth: 292,
    paddingHorizontal: 22,
  },
  compareFilesText: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  heroBanner: {
    aspectRatio: diffStartHeroAspectRatio,
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  launcherRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
  },
  launcherSection: {
    gap: 22,
  },
  launcherControls: {
    gap: 10,
  },
  openError: {
    bottom: 28,
    left: 48,
    position: "absolute",
    right: 48,
  },
  openFolderButton: {
    alignItems: "center",
    borderRadius: 7,
    flexDirection: "row",
    gap: 8,
    height: 60,
    justifyContent: "center",
    minWidth: 278,
    paddingHorizontal: 22,
  },
  openFolderText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  recentGroup: {
    gap: 8,
  },
  recentGroupList: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  recentGroups: {
    gap: 26,
    paddingTop: 24,
  },
  recentGroupTitle: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  recentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recentRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recentRowDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  recentRowIcon: {
    alignItems: "center",
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  recentRowStatus: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 70,
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
  recentTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
  },
  root: {
    alignItems: "center",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    paddingBottom: 34,
    paddingHorizontal: 48,
    paddingTop: diffStartScreenBrandTitlebarHeight + 16,
    position: "relative",
  },
  segmentedControl: {
    height: 28,
    marginTop: 18,
    width: 390,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  recentSection: {
    minWidth: 0,
  },
  startPage: {
    gap: diffStartScreenSectionGap,
    maxWidth: diffStartScreenMaxContentWidth,
    width: "100%",
  },
  urlField: {
    alignItems: "center",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flex: 1,
    gap: 8,
    height: 60,
    minWidth: 0,
    paddingLeft: 18,
  },
  urlInput: {
    flex: 1,
    fontSize: 16,
    height: 58,
    lineHeight: 22,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 16,
  },
  urlOpenButton: {
    alignItems: "center",
    alignSelf: "stretch",
    borderLeftWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minWidth: 150,
    paddingHorizontal: 18,
  },
  urlOpenButtonText: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  validationText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
