import type { ProcessOptions, ProcessResult } from "@legendapp/spark/processes";
export type ProcessFixture = { exitCode?: number; stdout?: string; stderr?: string; timedOut?: boolean };
export function processResult({ exitCode = 0, stdout = "", stderr = "", timedOut = false }: ProcessFixture = {}): ProcessResult {
 return { aborted: false, outputTruncated: false, exit: { type: "exited", code: exitCode }, stdout: new TextEncoder().encode(stdout), stderr: new TextEncoder().encode(stderr), timedOut };
}
export function createTestProcesses({ run }: { run?: (options: ProcessOptions) => ProcessFixture | Promise<ProcessFixture> } = {}) {
 return { runCommand: async (options: ProcessOptions) => processResult(await run?.(options)) };
}
