import React from "react";
import { render } from "@testing-library/react-native";
import { getLegendDisplayTheme, getMarkdownLayoutTheme } from "@legend-apps/theme";
import { inputStyleFromMarkdownStyle } from "../../../../packages/markdown-document/src/markdownLayout";
import { TranscriptRow } from "../../../chat-history/src/TranscriptRow";
import { getMarkdownStyleForAppearance } from "../markdownAppearance";

jest.mock("react-native", () => ({ ...jest.requireActual("../../jest/reactNativeMock.cjs"), PlatformColor: (color: string) => color }));
jest.mock("uniwind", () => ({ useUniwind: jest.fn() }));
jest.mock("@legendapp/list/react-native", () => ({ useRecyclingState: jest.fn() }));
jest.mock("react-native-enriched-markdown", () => ({ EnrichedMarkdownText: jest.fn(() => null) }));
const { useUniwind } = jest.requireMock("uniwind");

for (const appearance of ["light", "dark"] as const) describe(`${appearance} shared link styles`, () => {
  const theme = getLegendDisplayTheme(appearance);
  const { link, linkVariants } = theme.markdownStyle;
  const variantsFor = (url: string) => Object.entries(linkVariants!).filter(([pattern]) => new RegExp(pattern).test(url));

  it.each([
    "https://github.com/legendapp/legend-state/issues/12",
    "http://github.com/legendapp/legend-state/pull/12",
    "https://github.com/legendapp/legend-state/pull/12/files",
    "https://github.com/legendapp/legend-state/issues/12?x=y#issuecomment-1",
  ])("highlights GitHub issue and PR URLs: %s", url => {
    expect(variantsFor(url)).toHaveLength(1);
    expect(variantsFor(url)[0][1]).toEqual({
      backgroundColor: appearance === "light" ? theme.colors.border : theme.colors.surfaceMuted,
      underline: false,
    });
  });

  it.each(["mention:jay", "mention://jay", "user:123", "user://jay"])("highlights mention URLs: %s", url => {
    expect(variantsFor(url)).toHaveLength(1);
    expect(variantsFor(url)[0][1]).toEqual({
      color: theme.colors.primary,
      backgroundColor: appearance === "light" ? `${theme.colors.primary.slice(0, 7)}1f` : theme.colors.blockquoteBackground,
      underline: false,
    });
  });

  it.each([
    "https://example.com", "http://example.com", "mailto:jay@example.com", "#heading", "../notes.md",
    "https://github.com/legendapp/legend-state", "https://github.com/legendapp/legend-state/issues",
    "https://github.com/legendapp/legend-state/issues/12abc", "https://github.com/legendapp/legend-state/pulls/12",
    "https://github.com.evil.test/owner/repo/issues/12", "https://evil.test/github.com/owner/repo/issues/12",
    "https://github.com@evil.test/owner/repo/issues/12", "https://github.com/owner/repo/discussions/12",
    "https://example.com/mention:jay", "superuser:123", "@jay",
  ])("keeps other links on the base style: %s", url => {
    expect(variantsFor(url)).toHaveLength(0);
    expect(link).toEqual({ color: theme.colors.link ?? theme.colors.primary, underline: true });
  });

  it("keeps link chips color-only", () => {
    for (const variant of Object.values(linkVariants!)) {
      expect(Object.keys(variant).every(key => ["color", "backgroundColor", "underline"].includes(key))).toBe(true);
    }
  });

  it("preserves variants through document appearance and editor styles", () => {
    const style = getMarkdownStyleForAppearance(theme, getMarkdownLayoutTheme("default"), {
      contentWidth: "standard", density: "comfortable", fontFamily: "system", fontSize: "default", lineHeight: "normal",
    });
    expect(style.linkVariants).toBe(linkVariants);
    expect(inputStyleFromMarkdownStyle(style).linkVariants).toBe(linkVariants);
  });

  it.each(["assistant", "user"] as const)("passes the shared links to chat %s Markdown", async kind => {
    useUniwind.mockReturnValue({ theme: appearance });
    const view = await render(<TranscriptRow document={{} as never} index={0}
      metadata={{ kind, markdownBlockId: "message", imageCount: 0 } as never} />);
    const { EnrichedMarkdownText } = jest.requireMock("react-native-enriched-markdown");
    const { markdownStyle } = EnrichedMarkdownText.mock.calls.at(-1)[0];
    expect(markdownStyle.linkVariants).toBe(linkVariants);
    expect(markdownStyle.link).toBe(link);
    await view.unmount();
  });
});
