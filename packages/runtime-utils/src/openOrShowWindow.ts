import { getWindow, showWindow, type WindowInfo } from "@legendapp/spark/windows";

/** Reuse an app's singleton window, including windows restored by the host. */
export function openOrShowWindow(id: string, open: () => Promise<WindowInfo>): Promise<WindowInfo> {
  return open().catch(async (error: unknown) => {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "E_ALREADY_EXISTS") {
      throw error;
    }
    await showWindow(id);
    return getWindow(id);
  });
}
