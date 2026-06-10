import {
  runMarkdownDocumentE2EScenario,
  type MarkdownDocumentE2EResult,
  type MarkdownDocumentE2EScenarioName,
} from "@legend-desktop/markdown-document";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type MarkdownE2ERunnerProps = {
  blockCount?: number;
  scenario: MarkdownDocumentE2EScenarioName;
  seed?: number;
};

export type MarkdownEditorE2EScenarioName = "editor-selection-smoke" | "editor-soft-wrap-selection" | "editor-ui-smoke";
export type MarkdownE2ELaunchScenario = MarkdownDocumentE2EScenarioName | MarkdownEditorE2EScenarioName;

export function isMarkdownDocumentE2EScenario(
  scenario: string,
): scenario is MarkdownDocumentE2EScenarioName {
  return scenario === "far-down-structural-edits" || scenario === "hydrate-while-editing";
}

function isMarkdownE2ELaunchScenario(scenario: string): scenario is MarkdownE2ELaunchScenario {
  return scenario === "editor-ui-smoke" || scenario === "editor-selection-smoke" || scenario === "editor-soft-wrap-selection" || isMarkdownDocumentE2EScenario(scenario);
}

type MarkdownE2ERunnerState =
  | { status: "running" }
  | { result: MarkdownDocumentE2EResult; status: "passed" }
  | { error: Error; status: "failed" };

export function getMarkdownE2ERunFromLaunchArguments(launchArguments: string[] | undefined) {
  if (!__DEV__) {
    return null;
  }

  const args = launchArguments ?? [];
  const scenarioArgument = args.find((argument) => argument.startsWith("--markdown-e2e="));
  const scenarioValue = scenarioArgument?.slice("--markdown-e2e=".length);
  if (!scenarioValue || !isMarkdownE2ELaunchScenario(scenarioValue)) {
    return null;
  }

  const seedArgument = args.find((argument) => argument.startsWith("--markdown-e2e-seed="));
  const blockCountArgument = args.find((argument) => argument.startsWith("--markdown-e2e-block-count="));
  const seed = seedArgument ? Number(seedArgument.slice("--markdown-e2e-seed=".length)) : undefined;
  const blockCount = blockCountArgument ? Number(blockCountArgument.slice("--markdown-e2e-block-count=".length)) : undefined;

  return {
    blockCount: Number.isFinite(blockCount) ? blockCount : undefined,
    scenario: scenarioValue,
    seed: Number.isFinite(seed) ? seed : undefined,
  };
}

export function MarkdownE2ERunner({ blockCount, scenario, seed }: MarkdownE2ERunnerProps) {
  const [state, setState] = useState<MarkdownE2ERunnerState>({ status: "running" });

  useEffect(() => {
    let isCanceled = false;
    setState({ status: "running" });
    runMarkdownDocumentE2EScenario(scenario, { blockCount, seed })
      .then((result) => {
        if (!isCanceled) {
          setState({ result, status: "passed" });
        }
      })
      .catch((error: unknown) => {
        if (!isCanceled) {
          setState({ error: error instanceof Error ? error : new Error(String(error)), status: "failed" });
        }
      });

    return () => {
      isCanceled = true;
    };
  }, [blockCount, scenario, seed]);

  const title = state.status === "running"
    ? `E2E running: ${scenario}`
    : state.status === "passed"
      ? state.result.message
      : `E2E failed: ${scenario}`;
  const detail = state.status === "passed"
    ? `blocks=${state.result.blockCount} source=${state.result.sourceSize}`
    : state.status === "failed"
      ? state.error.message
      : "Running markdown editing scenario...";

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {
    color: "#4b5563",
    fontSize: 14,
    marginTop: 8,
  },
  root: {
    alignItems: "center",
    backgroundColor: "#f9fafb",
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  title: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "600",
  },
});
