import { runCommand } from "@legendapp/spark/processes";
import { runDiffCustomizationAI } from "../diffCustomizationAI";

jest.mock("@legendapp/spark/ai", () => ({
  buildAIInvocation: (tool: string) => ({ command: tool, args: ["exec", "-"] }),
  parseAIJson: (output: string) => JSON.parse(output),
}));

const result = { stdout: new TextEncoder().encode('{"edits":[]}'), stderr: new Uint8Array(), exit: { type: "exited" as const, code: 0 }, aborted: false, timedOut: false, outputTruncated: false };

it.each(["codex", "claude"] as const)("streams large %s prompts without exceeding macOS argument limits", async tool => {
  jest.mocked(runCommand).mockResolvedValueOnce(result);
  const prompt = "source".repeat(60_000);
  await expect(runDiffCustomizationAI(prompt, tool, "/customizations", new AbortController().signal)).resolves.toEqual({ edits: [] });
  const command = jest.mocked(runCommand).mock.calls.at(-1)![0];
  expect(command.input).toBe(prompt);
  expect(command.args!.join(" ").length).toBeLessThan(1000);
  if (tool === "codex") expect(command.args).toContain("read-only");
  else expect(command.args).toEqual(expect.arrayContaining(["--tools", "", "--strict-mcp-config"]));
});

it("rejects truncated output before parsing any generated edits", async () => {
  jest.mocked(runCommand).mockResolvedValueOnce({ ...result, outputTruncated: true });
  await expect(runDiffCustomizationAI("Change colors", "claude", "/customizations", new AbortController().signal)).rejects.toThrow("too large");
});
