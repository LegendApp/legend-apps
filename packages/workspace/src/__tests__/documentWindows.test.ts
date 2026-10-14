import { addWindowListener, openWindow } from "@legendapp/spark/windows";
import { createDocumentWindowRegistry, openDocumentWindow, trackDocumentWindow } from "../documentWindows";

const mockFocusListeners = new Map<string, (event: { focused: boolean }) => void>();

jest.mock("@legendapp/spark/windows", () => ({
  addWindowListener: jest.fn(async (id: string, _type: string, listener: (event: { focused: boolean }) => void) => {
    mockFocusListeners.set(id, listener);
    return { remove: jest.fn(async () => {}) };
  }),
  openWindow: jest.fn(async ({ id }: { id: string }) => ({ id })),
}));

describe("document windows", () => {
  it("opens numbered instances of the base window component", async () => {
    const untrack = trackDocumentWindow("editor");
    await openDocumentWindow("editor", { folders: ["/repo"] }, { title: "Editor" });
    expect(openWindow).toHaveBeenLastCalledWith({
      component: "spark.window.editor",
      id: "editor-2",
      props: { folders: ["/repo"], windowId: "editor-2" },
      title: "Editor",
    });

    untrack();
    await openDocumentWindow("editor", {}, {});
    expect(openWindow).toHaveBeenLastCalledWith(expect.objectContaining({ id: "editor" }));
  });

  it("releases an instance ID when opening fails", async () => {
    jest.mocked(openWindow).mockRejectedValueOnce(new Error("failed"));
    await expect(openDocumentWindow("viewer", {}, {})).rejects.toThrow("failed");
    await openDocumentWindow("viewer", {}, {});
    expect(openWindow).toHaveBeenLastCalledWith(expect.objectContaining({ id: "viewer" }));
  });

  it("routes to the most recently focused registered window", async () => {
    const registry = createDocumentWindowRegistry<string>();
    const cleanups = [trackDocumentWindow("a"), trackDocumentWindow("b")];
    registry.register("a", "target-a");
    const unregisterB = registry.register("b", "target-b");
    await Promise.resolve();
    expect(addWindowListener).toHaveBeenCalledWith("a", "focusChanged", expect.any(Function));
    expect(registry.active()).toBe("target-b");

    mockFocusListeners.get("a")?.({ focused: true });
    expect(registry.active()).toBe("target-a");

    mockFocusListeners.get("b")?.({ focused: true });
    unregisterB();
    expect(registry.active()).toBe("target-a");

    cleanups.forEach(cleanup => cleanup());
    expect(registry.active()).toBeUndefined();
  });
});
