jest.mock("react-native", () => ({
  StyleSheet: {
    create: (styles: object) => styles,
  },
  Text: "Text",
  View: "View",
}));

jest.mock("@legend-apps/markdown-document", () => ({
  runMarkdownDocumentE2EScenario: jest.fn(),
}));

import { getMarkdownE2ERunFromLaunchArguments } from "../MarkdownE2ERunner";

describe("getMarkdownE2ERunFromLaunchArguments", () => {
  const setDev = (value: boolean) => {
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = value;
  };

  beforeEach(() => {
    setDev(true);
  });

  it("parses document e2e scenarios with numeric options", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=far-down-structural-edits",
      "--markdown-e2e-seed=42",
      "--markdown-e2e-block-count=500",
    ])).toEqual({
      blockCount: 500,
      scenario: "far-down-structural-edits",
      seed: 42,
    });
  });

  it("accepts editor selection smoke launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=editor-selection-smoke",
    ])).toEqual({
      blockCount: undefined,
      scenario: "editor-selection-smoke",
      seed: undefined,
    });
  });

  it("accepts editor soft-wrap selection launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=editor-soft-wrap-selection",
    ])).toEqual({
      blockCount: undefined,
      scenario: "editor-soft-wrap-selection",
      seed: undefined,
    });
  });

  it("accepts editor code block smoke launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=editor-code-block-smoke",
    ])).toEqual({
      blockCount: undefined,
      scenario: "editor-code-block-smoke",
      seed: undefined,
    });
  });

  it("accepts editor navigation smoke launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=editor-navigation-smoke",
    ])).toEqual({
      blockCount: undefined,
      scenario: "editor-navigation-smoke",
      seed: undefined,
    });
  });

  it("accepts editor edit navigation smoke launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=editor-edit-navigation-smoke",
    ])).toEqual({
      blockCount: undefined,
      scenario: "editor-edit-navigation-smoke",
      seed: undefined,
    });
  });

  it("accepts editor theme reflow smoke launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments([
      "--markdown-e2e=editor-theme-reflow-smoke",
    ])).toEqual({
      blockCount: undefined,
      scenario: "editor-theme-reflow-smoke",
      seed: undefined,
    });
  });

  it("ignores invalid scenarios and production launches", () => {
    expect(getMarkdownE2ERunFromLaunchArguments(["--markdown-e2e=missing"])).toBeNull();

    setDev(false);
    expect(getMarkdownE2ERunFromLaunchArguments(["--markdown-e2e=editor-ui-smoke"])).toBeNull();
  });
});
