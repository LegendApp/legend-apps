export type PresenterMode = "presentation" | "rehearsal";

export type PresenterTimerPauseReason = "editing" | "manual" | "presentation-start" | "stopped" | null;

export type PresenterTimerState = {
  mode: PresenterMode | null;
  pauseReason: PresenterTimerPauseReason;
  running: boolean;
};

export type PresenterTimerEvent =
  | { mode: PresenterMode; type: "audience-started" }
  | { type: "audience-stopped" }
  | { type: "editing-started" }
  | { from: number; to: number; type: "slide-navigated" }
  | { type: "pause-requested" }
  | { type: "resume-requested" }
  | { type: "restart-requested" };

export type PresenterTimerTransition = {
  restart: boolean;
  state: PresenterTimerState;
};

export type PresenterTimerBehavior = {
  presentationStartsOnSecondSlide: boolean;
  rehearsalPausesWhileEditing: boolean;
};

export const defaultPresenterTimerBehavior: PresenterTimerBehavior = {
  presentationStartsOnSecondSlide: true,
  rehearsalPausesWhileEditing: true,
};

export const initialPresenterTimerState: PresenterTimerState = {
  mode: null,
  pauseReason: "stopped",
  running: false,
};

export function transitionPresenterTimer(
  state: PresenterTimerState,
  event: PresenterTimerEvent,
  behavior: PresenterTimerBehavior = defaultPresenterTimerBehavior,
): PresenterTimerTransition {
  if (event.type === "audience-started") {
    const running = event.mode === "rehearsal" || !behavior.presentationStartsOnSecondSlide;
    return {
      restart: true,
      state: {
        mode: event.mode,
        pauseReason: running ? null : "presentation-start",
        running,
      },
    };
  }

  if (event.type === "audience-stopped") {
    return {
      restart: false,
      state: { mode: null, pauseReason: "stopped", running: false },
    };
  }

  if (event.type === "slide-navigated") {
    if (event.from === event.to) {
      return { restart: false, state };
    }
    if (
      behavior.presentationStartsOnSecondSlide &&
      state.mode === "presentation" &&
      event.from === 0 &&
      event.to === 1
    ) {
      return {
        restart: true,
        state: { ...state, pauseReason: null, running: true },
      };
    }
    if (state.mode === "rehearsal" && state.pauseReason === "editing") {
      return {
        restart: false,
        state: { ...state, pauseReason: null, running: true },
      };
    }
    return { restart: false, state };
  }

  if (event.type === "editing-started") {
    if (behavior.rehearsalPausesWhileEditing && state.mode === "rehearsal" && state.running) {
      return {
        restart: false,
        state: { ...state, pauseReason: "editing", running: false },
      };
    }
    return { restart: false, state };
  }

  if (event.type === "pause-requested") {
    return {
      restart: false,
      state: { ...state, pauseReason: "manual", running: false },
    };
  }

  if (event.type === "resume-requested") {
    return {
      restart: false,
      state: { ...state, pauseReason: null, running: true },
    };
  }

  return {
    restart: true,
    state: { ...state, pauseReason: null, running: true },
  };
}
