import { Buffer } from "buffer";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import {
  buildAIInvocation,
  formatAIErrorOutput,
  getAICommandAvailability,
  runAITool,
  type AIToolId,
} from "@legendapp/spark/ai";
import { runCommand, type ProcessResult } from "@legendapp/spark/processes";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

type AIExampleProps = {
  testId: string;
};

function mockResult(text: string): ProcessResult {
  return { stdout: Buffer.from(text, "utf8"), stderr: new Uint8Array(), exit: { type: "exited", code: 0 }, timedOut: false, aborted: false, outputTruncated: false };
}
const defaultPrompt = "Return one concise sentence describing what this tester verifies.";
const testTools = ["mock", "claude", "codex"] as const;
type TestTool = (typeof testTools)[number];

async function runExampleCommand(tool: TestTool): Promise<ProcessResult> {
  if (tool === "mock") return mockResult("Legend command runner");
  return runCommand({ target: { type: "command", name: "echo" }, args: ["Legend command runner"], timeoutMs: 5000 });
}
async function runExampleAITool(selectedTool: TestTool, tool: AIToolId, prompt: string) {
  if (selectedTool === "mock") {
    const invocation = buildAIInvocation(tool, prompt);
    return { ...mockResult(`mock:${invocation.command} ${invocation.args.join(" ")}`), tool, output: "Mock AI output" };
  }
  return runAITool({ prompt, timeoutMs: 60000, tool });
}

function processSucceeded(result: ProcessResult): boolean {
  return result.exit.type === "exited" && result.exit.code === 0;
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function ToolPicker({ selectedTool, onSelect }: { selectedTool: TestTool; onSelect: (tool: TestTool) => void }) {
  return (
    <View style={localStyles.segmentedRow}>
      {testTools.map((tool) => (
        <Pressable
          key={tool}
          onPress={() => onSelect(tool)}
          style={({ pressed }) => [
            localStyles.segmentedButton,
            selectedTool === tool && localStyles.segmentedButtonSelected,
            pressed && localStyles.segmentedButtonPressed,
          ]}
        >
          <Text style={[localStyles.segmentedButtonText, selectedTool === tool && localStyles.segmentedButtonTextSelected]}>
            {tool}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AIExample({ testId }: AIExampleProps) {
  const isCommandRunnerTest = testId === "ai-command-runner";
  const [selectedTool, setSelectedTool] = useState<TestTool>("mock");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [status, setStatus] = useState("Ready");
  const [result, setResult] = useState("No result yet.");

  const activeTool: AIToolId = selectedTool === "codex" ? "codex" : "claude";

  const refreshAvailability = async () => {
    setStatus("Checking availability...");
    const request = selectedTool === "mock"
      ? Promise.resolve({ claude: true, codex: true, preferredTool: "claude" })
      : getAICommandAvailability();
    try {
      const availability = await request;
      setResult(formatJson(availability));
      setStatus("Availability refreshed.");
    } catch (error) {
      setStatus("Availability check failed.");
      setResult(formatUnknownError(error));
    }
  };

  const runCommandRunnerTest = async () => {
    setStatus("Running command...");
    try {
      const commandResult = await runExampleCommand(selectedTool);
      setResult(formatJson(commandResult));
      if (processSucceeded(commandResult)) {
        setStatus("Command completed.");
      } else {
        setStatus("Command exited with an error.");
      }
    } catch (error) {
      setStatus("Command failed.");
      setResult(formatUnknownError(error));
    }
  };

  const runAIToolTest = async () => {
    setStatus("Running AI tool...");
    try {
      const invocation = buildAIInvocation(activeTool, prompt);
      const runResult = await runExampleAITool(selectedTool, activeTool, prompt);
      let errorPreview = "";
      if (!processSucceeded(runResult)) {
        let errorOutput = decodeProcessText(runResult.stderr);
        if (!errorOutput) {
          errorOutput = decodeProcessText(runResult.stdout);
        }
        errorPreview = formatAIErrorOutput(errorOutput);
      }
      setResult(formatJson({ invocation, runResult, errorPreview }));
      if (processSucceeded(runResult)) {
        setStatus("AI tool completed.");
      } else {
        setStatus("AI tool exited with an error.");
      }
    } catch (error) {
      setStatus("AI tool failed.");
      setResult(formatUnknownError(error));
    }
  };

  return (
    <ExamplePanel title={isCommandRunnerTest ? "Command Runner" : "AI Tool Runner"}>
      <Text style={styles.bodyText}>{status}</Text>
      <ToolPicker selectedTool={selectedTool} onSelect={setSelectedTool} />
      {!isCommandRunnerTest && (
        <TextInput
          multiline
          onChangeText={setPrompt}
          style={localStyles.promptInput}
          value={prompt}
          placeholder="Prompt"
          placeholderTextColor="#94a3b8"
        />
      )}
      <View style={styles.controlRow}>
        <ExampleButton onPress={() => void refreshAvailability()}>Refresh Availability</ExampleButton>
        <ExampleButton onPress={() => void (isCommandRunnerTest ? runCommandRunnerTest() : runAIToolTest())}>
          {isCommandRunnerTest ? "Run Command" : "Run AI Tool"}
        </ExampleButton>
      </View>
      <Text selectable style={styles.resultText}>
        {result}
      </Text>
    </ExamplePanel>
  );
}

const localStyles = StyleSheet.create({
  promptInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 13,
    lineHeight: 18,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    width: 480,
  },
  segmentedButton: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentedButtonPressed: {
    backgroundColor: "#e2e8f0",
  },
  segmentedButtonSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  segmentedButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "capitalize",
  },
  segmentedButtonTextSelected: {
    color: "#ffffff",
  },
  segmentedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
});
