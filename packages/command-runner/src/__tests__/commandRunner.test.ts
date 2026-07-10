import { commandRunner, createMockCommandRunner } from "../index";

type CommandRunnerModule = typeof import("../index");

function loadCommandRunnerWithNative(nativeModule: {
  getAvailability?: jest.Mock;
  runCommand?: jest.Mock;
  runCommands?: jest.Mock;
}) {
  jest.resetModules();
  jest.doMock("react-native", () => ({
    Platform: {
      OS: "macos",
    },
    TurboModuleRegistry: {
      get: () => nativeModule,
    },
  }));

  return require("../index") as CommandRunnerModule;
}

afterEach(() => {
  jest.dontMock("react-native");
  jest.resetModules();
});

describe("commandRunner", () => {
  it("returns false availability when the native module is missing", async () => {
    await expect(commandRunner.getAvailability(["echo", "echo", " "])).resolves.toEqual({
      echo: false,
    });
  });

  it("throws when running a command without the native module", async () => {
    await expect(commandRunner.runCommand({ command: "echo" })).rejects.toThrow(
      "CommandRunner native module is not available",
    );
  });

  it("returns an empty batch without the native module", async () => {
    await expect(commandRunner.runCommands([])).resolves.toEqual([]);
  });

  it("serializes normalized command availability requests", async () => {
    const nativeModule = {
      getAvailability: jest.fn(async () => JSON.stringify({ echo: true })),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);

    await expect(nativeCommandRunner.getAvailability([" echo ", "echo", "missing", ""])).resolves.toEqual({
      echo: true,
      missing: false,
    });
    expect(nativeModule.getAvailability).toHaveBeenCalledWith(JSON.stringify(["echo", "missing"]));
  });

  it("treats malformed availability responses as unavailable", async () => {
    const nativeModule = {
      getAvailability: jest.fn(async () => "not json"),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);

    await expect(nativeCommandRunner.getAvailability(["echo", "missing"])).resolves.toEqual({
      echo: false,
      missing: false,
    });
  });

  it("serializes command params and normalizes native command results", async () => {
    const nativeModule = {
      runCommand: jest.fn(async () =>
        JSON.stringify({
          stdout: "out",
          stderr: "err",
          exitCode: 3,
          timedOut: true,
        }),
      ),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);
    const params = {
      command: "echo",
      args: ["hello"],
      cwd: "/tmp/repo",
      input: "stdin",
      timeoutMs: 1000,
    };

    await expect(nativeCommandRunner.runCommand(params)).resolves.toEqual({
      stdout: "out",
      stderr: "err",
      exitCode: 3,
      timedOut: true,
    });
    expect(nativeModule.runCommand).toHaveBeenCalledWith(JSON.stringify(params));
  });

  it("defaults malformed command result fields", async () => {
    const nativeModule = {
      runCommand: jest.fn(async () =>
        JSON.stringify({
          stdout: 123,
          stderr: "err",
          exitCode: "3",
          timedOut: "true",
        }),
      ),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);

    await expect(nativeCommandRunner.runCommand({ command: "echo" })).resolves.toEqual({
      stdout: "",
      stderr: "err",
      exitCode: -1,
      timedOut: false,
    });
  });

  it("defaults invalid command result JSON", async () => {
    const nativeModule = {
      runCommand: jest.fn(async () => "not json"),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);

    await expect(nativeCommandRunner.runCommand({ command: "echo" })).resolves.toEqual({
      stdout: "",
      stderr: "",
      exitCode: -1,
      timedOut: false,
    });
  });

  it("serializes command batches and normalizes every result", async () => {
    const nativeModule = {
      runCommands: jest.fn(async () => JSON.stringify([
        { stdout: "one", stderr: "", exitCode: 0, timedOut: false },
        { stdout: 2, stderr: "err", exitCode: "1", timedOut: false },
      ])),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);
    const params = [{ command: "one" }, { command: "two" }];

    await expect(nativeCommandRunner.runCommands(params)).resolves.toEqual([
      { stdout: "one", stderr: "", exitCode: 0, timedOut: false },
      { stdout: "", stderr: "err", exitCode: -1, timedOut: false },
    ]);
    expect(nativeModule.runCommands).toHaveBeenCalledWith(JSON.stringify(params));
  });

  it("does not call native for an empty command batch", async () => {
    const nativeModule = {
      runCommands: jest.fn(),
    };
    const { commandRunner: nativeCommandRunner } = loadCommandRunnerWithNative(nativeModule);

    await expect(nativeCommandRunner.runCommands([])).resolves.toEqual([]);
    expect(nativeModule.runCommands).not.toHaveBeenCalled();
  });
});

describe("createMockCommandRunner", () => {
  it("normalizes command availability", async () => {
    const runner = createMockCommandRunner({ availability: { codex: true } });

    await expect(runner.getAvailability(["codex", "claude", "codex", " "])).resolves.toEqual({
      claude: false,
      codex: true,
    });
  });

  it("returns configured command results", async () => {
    const runner = createMockCommandRunner({
      run: (params) => ({
        stdout: params.command,
        stderr: params.args?.join(",") ?? "",
        exitCode: 7,
        timedOut: true,
      }),
    });

    await expect(runner.runCommand({ command: "test", args: ["a", "b"] })).resolves.toEqual({
      stdout: "test",
      stderr: "a,b",
      exitCode: 7,
      timedOut: true,
    });
  });

  it("uses input as the default command output", async () => {
    const runner = createMockCommandRunner();

    await expect(runner.runCommand({ command: "cat", args: ["ignored"], input: "stdin" })).resolves.toEqual({
      stdout: "stdin",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
  });

  it("uses joined args as the default command output when input is missing", async () => {
    const runner = createMockCommandRunner();

    await expect(runner.runCommand({ command: "echo", args: ["hello", "world"] })).resolves.toEqual({
      stdout: "hello world",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
  });

  it("runs mock command batches with the configured runner", async () => {
    const runner = createMockCommandRunner({
      run: (params) => ({
        stdout: params.command,
        stderr: "",
        exitCode: 0,
        timedOut: false,
      }),
    });

    await expect(runner.runCommands([{ command: "one" }, { command: "two" }])).resolves.toEqual([
      expect.objectContaining({ stdout: "one" }),
      expect.objectContaining({ stdout: "two" }),
    ]);
  });
});
