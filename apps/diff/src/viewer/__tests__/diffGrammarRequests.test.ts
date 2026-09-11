import { watchDiffGrammarRequests } from "../diffGrammarRequests";
import { treeGrammarManager } from "@legend-apps/syntax-parser";

jest.mock("@legend-apps/syntax-parser", () => ({
  isKnownGrammar: (name: string) => ["rust", "typescript"].includes(name),
  treeGrammarManager: { ensure: jest.fn(), subscribe: jest.fn(), getSnapshot: jest.fn() },
}));
const manager = jest.mocked(treeGrammarManager);
describe("Diff grammar demand", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());
  it("deduplicates demands, ignores unknown fences, and waits for explicit retry after failure", async () => {
    const document = { getMissingSyntaxLanguages: jest.fn(() => ["rust", "unknown"]), refreshSyntaxGrammars: jest.fn() };
    let listener = () => {};
    const unsubscribe = jest.fn();
    manager.subscribe.mockImplementation((_name, callback) => { listener = callback; return unsubscribe; });
    manager.ensure.mockRejectedValue(Error("offline"));
    manager.getSnapshot.mockReturnValue({ phase: "idle", language: "rust", completed: 0, total: 0 });
    const found = jest.fn();
    const stop = watchDiffGrammarRequests(document, found);
    await Promise.resolve();
    manager.getSnapshot.mockReturnValue({ phase: "error", language: "rust", completed: 0, total: 0 });
    jest.advanceTimersByTime(2000);
    expect(manager.ensure).toHaveBeenCalledTimes(1);
    expect(found).toHaveBeenCalledWith("rust");
    expect(found).toHaveBeenCalledTimes(1);
    expect(document.refreshSyntaxGrammars).not.toHaveBeenCalled();
    manager.getSnapshot.mockReturnValue({ phase: "ready", language: "rust", completed: 10, total: 10 });
    listener();
    expect(document.refreshSyntaxGrammars).toHaveBeenCalledTimes(1);
    stop();
    listener();
    expect(document.refreshSyntaxGrammars).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("does not touch a disposed document when a pending download completes", async () => {
    const document = { getMissingSyntaxLanguages: jest.fn(() => ["rust"]), refreshSyntaxGrammars: jest.fn() };
    let finish = () => {};
    manager.ensure.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    manager.subscribe.mockReturnValue(jest.fn());
    manager.getSnapshot.mockReturnValue({ phase: "idle", language: "rust", completed: 0, total: 0 });
    const stop = watchDiffGrammarRequests(document, jest.fn());
    stop(); finish(); await Promise.resolve();
    jest.advanceTimersByTime(1000);
    expect(document.getMissingSyntaxLanguages).toHaveBeenCalledTimes(1);
    expect(document.refreshSyntaxGrammars).not.toHaveBeenCalled();
  });
});
