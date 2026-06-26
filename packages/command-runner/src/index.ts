import { Platform } from "react-native";
import NativeCommandRunner from "./NativeCommandRunner";

export type CommandAvailability = Record<string, boolean>;

export type CommandRunnerParams = {
  command: string;
  args?: string[];
  cwd?: string;
  input?: string;
  timeoutMs?: number;
};

export type CommandRunnerResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

export type CommandRunner = {
  getAvailability(commands: string[]): Promise<CommandAvailability>;
  runCommand(params: CommandRunnerParams): Promise<CommandRunnerResult>;
};

const unavailableError = new Error("CommandRunner native module is not available");

function safeParseObject<T extends object>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeCommands(commands: string[]) {
  return Array.from(new Set(commands.map((command) => command.trim()).filter(Boolean)));
}

function normalizeCommandRunnerResult(value: string): CommandRunnerResult {
  const parsed = safeParseObject<Partial<CommandRunnerResult>>(value, {});
  return {
    stdout: typeof parsed.stdout === "string" ? parsed.stdout : "",
    stderr: typeof parsed.stderr === "string" ? parsed.stderr : "",
    exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : -1,
    timedOut: typeof parsed.timedOut === "boolean" ? parsed.timedOut : false,
  };
}

export const commandRunner: CommandRunner = {
  async getAvailability(commands) {
    const normalizedCommands = normalizeCommands(commands);
    if (normalizedCommands.length === 0) {
      return {};
    }
    if (!NativeCommandRunner || Platform.OS !== "macos") {
      return Object.fromEntries(normalizedCommands.map((command) => [command, false]));
    }

    const result = await NativeCommandRunner.getAvailability(JSON.stringify(normalizedCommands));
    const parsed = safeParseObject<CommandAvailability>(result, {});
    return Object.fromEntries(normalizedCommands.map((command) => [command, Boolean(parsed[command])]));
  },
  async runCommand(params) {
    if (!NativeCommandRunner || Platform.OS !== "macos") {
      throw unavailableError;
    }

    const result = await NativeCommandRunner.runCommand(JSON.stringify(params));
    return normalizeCommandRunnerResult(result);
  },
};

export function createMockCommandRunner({
  availability = {},
  run,
}: {
  availability?: CommandAvailability;
  run?: (params: CommandRunnerParams) => Promise<CommandRunnerResult> | CommandRunnerResult;
} = {}): CommandRunner {
  return {
    async getAvailability(commands) {
      return Object.fromEntries(normalizeCommands(commands).map((command) => [command, Boolean(availability[command])]));
    },
    async runCommand(params) {
      if (run) {
        return run(params);
      }
      return {
        stdout: params.input ?? params.args?.join(" ") ?? "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    },
  };
}

export { default as NativeCommandRunner } from "./NativeCommandRunner";
