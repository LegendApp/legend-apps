import { closeWindow } from "@legend-apps/window-manager";
import { closeNotesOutput, resumeNotesOutput } from "./notesOutput";
import { prepareSlidesExit } from "./slidesExit";
import { getSlidesState } from "./slidesStore";

/** Keep the controller mounted until its serialized output operations finish. */
export async function closePresenterSession(closeAudience: () => Promise<unknown>) {
  if (!await prepareSlidesExit()) return;
  await closeAudience();
  if (getSlidesState().audienceOpen) throw new Error("Could not close the audience window. Stop presenting before closing the presenter.");
  try {
    await closeNotesOutput();
    const result = await closeWindow("slides-presenter");
    if (!result.success) throw new Error(result.message ?? "Could not close the presenter window.");
  } catch (error) {
    resumeNotesOutput();
    throw error;
  }
}
