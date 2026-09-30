import { closeWindow } from "@legendapp/spark/windows";
import { closeNotesOutput, resumeNotesOutput } from "./notesOutput";
import { prepareSlidesExit } from "./slidesExit";
import { getSlidesState } from "./slidesStore";

/** Keep the controller mounted until its serialized output operations finish. */
export async function preparePresenterSessionClose(closeAudience: () => Promise<unknown>) {
  if (!await prepareSlidesExit()) return false;
  await closeAudience();
  if (getSlidesState().audienceOpen) throw new Error("Could not close the audience window. Stop presenting before closing the presenter.");
  try {
    await closeNotesOutput();
    return true;
  } catch (error) {
    resumeNotesOutput();
    throw error;
  }
}

export async function closePresenterSession(closeAudience: () => Promise<unknown>) {
 if (!await preparePresenterSessionClose(closeAudience)) return;
 const result = await closeWindow("slides-presenter");
 if (!result.closed) { resumeNotesOutput(); throw new Error("Closing the presenter window was vetoed."); }
}
