import { highlightString } from "../index";
import { treeGrammarManager } from "../treeGrammarService";
import { NitroModules } from "react-native-nitro-modules";

jest.mock("../treeGrammarService", () => ({ treeGrammarManager: { ensure: jest.fn() } }));
jest.mock("../syntaxAssets", () => ({ defaultSyntaxThemeName: "dark-plus" }));
jest.mock("../syntaxThemeResolver", () => ({}));
jest.mock("../useGrammarProgress", () => ({}));
jest.mock("react-native-nitro-modules", () => ({
  NitroModules: { createHybridObject: jest.fn(() => ({ highlightTreeString: jest.fn(async () => ({ lines: [], styles: [] })) })) },
}));

describe("string highlighting", () => {
  beforeEach(() => { jest.mocked(treeGrammarManager.ensure).mockReset(); });
  it("acquires the shared remote grammar before highlighting", async () => {
    let ready!: () => void;
    jest.mocked(treeGrammarManager.ensure).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const result = highlightString("const value = 1;", "typescript");
    expect(treeGrammarManager.ensure).toHaveBeenCalledWith("typescript");
    expect(NitroModules.createHybridObject).not.toHaveBeenCalled();
    ready();
    await expect(result).resolves.toMatchObject({ lines: [] });
    const parser = jest.mocked(NitroModules.createHybridObject).mock.results[0].value;
    expect(parser.highlightTreeString).toHaveBeenCalledWith("const value = 1;", "typescript", "dark-plus");
  });
  it("keeps the plain-text native path available after download failure", async () => {
    jest.mocked(treeGrammarManager.ensure).mockRejectedValue(new Error("No release"));
    await expect(highlightString("text", "python")).resolves.toMatchObject({ lines: [] });
  });
  it("does not attempt to download unknown languages", async () => {
    await highlightString("text", "not-a-language");
    expect(treeGrammarManager.ensure).not.toHaveBeenCalled();
  });
});
