import { createMockCommandRunner } from "@legend-desktop/command-runner";
import { getAICommandAvailability, selectPreferredAITool } from "../availability";

describe("AI availability", () => {
  it("prefers claude when both tools are available", () => {
    expect(selectPreferredAITool({ claude: true, codex: true })).toBe("claude");
  });

  it("falls back to codex when claude is unavailable", () => {
    expect(selectPreferredAITool({ claude: false, codex: true })).toBe("codex");
  });

  it("returns null when no tools are available", () => {
    expect(selectPreferredAITool({ claude: false, codex: false })).toBeNull();
  });

  it("reads availability through an injected command runner", async () => {
    const runner = createMockCommandRunner({ availability: { claude: false, codex: true } });

    await expect(getAICommandAvailability(runner)).resolves.toEqual({
      claude: false,
      codex: true,
      preferredTool: "codex",
    });
  });
});
