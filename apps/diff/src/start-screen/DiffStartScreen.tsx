import { SFSymbol } from "@legend-desktop/sf-symbol";
import type { RefObject, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { RecentDiffSource } from "../diffAppMetadata";
import type { DiffOpenSource } from "../diffFiles";
import {
  diffRecentFilters,
  formatRecentDiffSourceOpenedAt,
  getGroupedRecentDiffSources,
  getRecentDiffSourceDetail,
  getRecentDiffSourceKind,
  getRecentDiffSourceTypeLabel,
  type DiffRecentFilter,
  type DiffRecentSourceGroup,
} from "./diffStartScreenModel";

const diffStartScreenSidebarWidth = 312;
const diffStartScreenMaxContentWidth = 1080;
const pullRequestAccentColor = "#a970ff";
const commitAccentColor = "#62d66f";

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
  primaryColor: string;
  recentFilter: DiffRecentFilter;
  recentSources: RecentDiffSource[];
  setRecentFilter: (filter: DiffRecentFilter) => void;
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

function getSourceAccentColor(source: DiffOpenSource, primaryColor: string, mutedColor: string) {
  const kind = getRecentDiffSourceKind(source);
  if (kind === "folder") {
    return primaryColor;
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
  primaryColor,
  recentSource,
}: {
  borderColor: string;
  foregroundColor: string;
  isLoading: boolean;
  mutedColor: string;
  onOpenSource: (source: DiffOpenSource) => void;
  primaryColor: string;
  recentSource: RecentDiffSource;
}) {
  const source = recentSource.source;
  const accentColor = getSourceAccentColor(source, primaryColor, mutedColor);
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
      <View style={[styles.recentRowBadge, { borderColor: accentColor }]}>
        <Text style={[styles.recentRowBadgeText, { color: accentColor }]} numberOfLines={1}>
          {getRecentDiffSourceTypeLabel(source)}
        </Text>
      </View>
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
  primaryColor,
}: {
  borderColor: string;
  foregroundColor: string;
  group: DiffRecentSourceGroup;
  isLoading: boolean;
  mutedColor: string;
  onOpenSource: (source: DiffOpenSource) => void;
  primaryColor: string;
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
            primaryColor={primaryColor}
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
  primaryColor,
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
      <View style={[styles.sidebar, { borderColor }]}>
        <View style={styles.identity}>
          <View style={[styles.identityIcon, { borderColor }]}>
            <SFSymbol color={primaryColor} name="arrow.left.arrow.right" size={16} />
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.identityTitle, { color: foregroundColor }]}>Legend Diff</Text>
            <Text style={[styles.identitySubtitle, { color: mutedColor }]}>Review changes</Text>
          </View>
        </View>
        <View style={[styles.sidebarDivider, { backgroundColor: borderColor }]} />
        <View style={styles.launcher}>
          <Pressable
            accessibilityRole="button"
            disabled={isLoading}
            onPress={onChooseFolder}
            style={({ pressed }) => [
              styles.openFolderButton,
              {
                backgroundColor: primaryColor,
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
          {urlInputError ? (
            <Text style={[styles.validationText, { color: dangerColor }]}>
              {urlInputError}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.contentInner}>
          {recentSources.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text style={[styles.recentTitle, { color: foregroundColor }]}>Recent</Text>
              </View>
              <View style={[styles.segmentedControl, { borderColor }]}>
                {diffRecentFilters.map((filter) => {
                  const isSelected = filter.key === recentFilter;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={filter.key}
                      onPress={() => setRecentFilter(filter.key)}
                      style={[
                        styles.segmentedOption,
                        isSelected ? { borderColor: primaryColor } : null,
                      ]}
                    >
                      <Text style={[
                        styles.segmentedOptionText,
                        { color: isSelected ? primaryColor : mutedColor },
                      ]}>
                        {filter.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                    primaryColor={primaryColor}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
        {openErrorBody ? (
          <View style={styles.openError}>
            {openErrorBody}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  contentInner: {
    alignSelf: "center",
    maxWidth: diffStartScreenMaxContentWidth,
    paddingHorizontal: 48,
    paddingTop: 78,
    width: "100%",
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  identityIcon: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  identitySubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  identityTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  launcher: {
    gap: 12,
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
    paddingTop: 28,
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
  recentRowBadge: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: "center",
    minWidth: 54,
    paddingHorizontal: 8,
  },
  recentRowBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
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
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    minWidth: 0,
  },
  segmentedControl: {
    alignSelf: "flex-start",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginTop: 18,
    overflow: "hidden",
  },
  segmentedOption: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    height: 34,
    justifyContent: "center",
    minWidth: 78,
    paddingHorizontal: 16,
  },
  segmentedOptionText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  sidebar: {
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 22,
    paddingHorizontal: 28,
    paddingTop: 52,
    width: diffStartScreenSidebarWidth,
  },
  sidebarDivider: {
    height: StyleSheet.hairlineWidth,
  },
  urlField: {
    alignItems: "center",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    height: 42,
    paddingLeft: 12,
  },
  urlInput: {
    flex: 1,
    fontSize: 13,
    height: 40,
    lineHeight: 18,
    minWidth: 0,
    paddingHorizontal: 0,
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
