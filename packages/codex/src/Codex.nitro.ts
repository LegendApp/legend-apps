import type { HybridObject } from "react-native-nitro-modules";

export interface CodexAvailability {
  available: boolean;
  codexPath: string;
  message: string;
  userAgent: string;
}

export interface CodexRunResult {
  model: string;
  output: string;
  threadId: string;
  turnId: string;
  userAgent: string;
}

export interface CodexAppServer extends HybridObject<{ ios: "c++" }> {
  getAvailability(): Promise<CodexAvailability>;
  runPrompt(
    prompt: string,
    cwd: string,
    reasoningEffort: string,
    timeoutMs: number,
    outputSchemaJson: string,
    developerInstructions: string,
  ): Promise<CodexRunResult>;
  cancelActiveRuns(): number;
  shutdown(): number;
}
