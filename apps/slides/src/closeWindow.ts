import { SparkError } from "@legendapp/spark/contracts";
import { closeWindow, type CloseResult } from "@legendapp/spark/windows";

/** Output cleanup succeeds when the native window is already gone. */
export async function closeSlidesWindow(id: string): Promise<CloseResult> {
  try {
    return await closeWindow(id);
  } catch (error) {
    if (error instanceof SparkError && error.code === "E_NOT_FOUND") return { closed: true };
    throw error;
  }
}
