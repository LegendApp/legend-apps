import { NativeSegmentedControl } from "@legend-desktop/native-select";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import type { RefObject, ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { RecentDiffSource } from "../diffAppMetadata";
import type { DiffOpenSource } from "../diffFiles";
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
const diffStartScreenAccentColor = "#426c9f";
const pullRequestAccentColor = "#a970ff";
const commitAccentColor = "#62d66f";
const diffAppIconSource = require("../../macos/legendapp-shell-macos/Assets.xcassets/AppIcon.appiconset/icon_32x32.png");

export type DiffStartScreenProps = {
  backgroundColor: string;
  borderColor: string;
  dangerColor: string;
  foregroundColor: string;
  isLoading: boolean;
  isLoadingGithub: boolean;
  mutedColor: string;
  onChangeUrlInput: (text: string) => void;
  onChooseFolder: () => void;
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
  return mutedColor;
}

function DiffStartScreenRecentRow({
  borderColor,
  foregroundColor,
  isLoading,
  mutedColor,
  onOpenSource,
  recentSource,
}: {
  borderColor: string;
  foregroundColor: string;
  isLoading: boolean;
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
      <Text style={[styles.recentRowTime, { color: mutedColor }]} numberOfLines={1}>
        {formatRecentDiffSourceOpenedAt(recentSource.lastOpenedAt)}
      </Text>
    </Pressable>
  );
}

function DiffStartScreenRecentGroup({
  borderColor,
  foregroundColor,
  group,
  isLoading,
  mutedColor,
  onOpenSource,
}: {
  borderColor: string;
  foregroundColor: string;
  group: DiffRecentSourceGroup;
  isLoading: boolean;
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
  isLoadingGithub,
  mutedColor,
  onChangeUrlInput,
  onChooseFolder,
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
  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={styles.startPage}>
        <View style={styles.launcherSection}>
          <View style={styles.identity}>
            <View style={[styles.identityIconFrame, { borderColor }]}>
              <Image source={diffAppIconSource} style={styles.identityIcon} />
            </View>
            <View style={styles.identityText}>
              <Text style={[styles.identityTitle, { color: foregroundColor }]}>Legend Diff</Text>
            </View>
          </View>
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
              <View style={[styles.urlField, { borderColor }]}>
                <SFSymbol color={mutedColor} name="link" size={15} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={onChangeUrlInput}
                  onSubmitEditing={onOpenUrl}
                  placeholder="Paste GitHub URL"
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
                  {isLoadingGithub ? (
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
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 2,
  },
  identityIconFrame: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    overflow: "hidden",
    width: 52,
  },
  identityIcon: {
    height: 52,
    width: 52,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  identityTitle: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 32,
  },
  launcherRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  launcherSection: {
    gap: 28,
  },
  launcherControls: {
    gap: 8,
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
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
    width: 220,
  },
  openFolderText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
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
  recentRowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  recentRowTime: {
    fontSize: 13,
    lineHeight: 18,
    minWidth: 70,
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
    paddingHorizontal: 72,
    paddingTop: 64,
    position: "relative",
  },
  segmentedControl: {
    height: 28,
    marginTop: 18,
    width: 312,
  },
  recentSection: {
    minWidth: 0,
  },
  startPage: {
    gap: 42,
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
    height: 42,
    minWidth: 0,
    paddingLeft: 12,
  },
  urlInput: {
    flex: 1,
    fontSize: 13,
    height: 40,
    lineHeight: 18,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  urlOpenButton: {
    alignItems: "center",
    alignSelf: "stretch",
    borderLeftWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minWidth: 56,
    paddingHorizontal: 10,
  },
  urlOpenButtonText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  validationText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
