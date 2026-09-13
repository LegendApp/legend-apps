import { PanResponder } from "react-native";

type ResizeCallbacks = {
  direction: "horizontal" | "vertical";
  onResize(delta: number): void;
  onResizeEnd(): void;
};

// The native responder retains its handlers for the lifetime of a resize handle.
// React publishes new callbacks after commit without replacing an active gesture.
export function createPresenterResizeResponder(initialCallbacks: ResizeCallbacks) {
  let callbacks = initialCallbacks;
  let lastDelta = 0;
  const end = () => {
    lastDelta = 0;
    callbacks.onResizeEnd();
  };
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { lastDelta = 0; },
    onPanResponderMove: (_event, gesture) => {
      const totalDelta = callbacks.direction === "horizontal" ? gesture.dx : gesture.dy;
      const delta = totalDelta - lastDelta;
      lastDelta = totalDelta;
      if (delta !== 0) callbacks.onResize(delta);
    },
    onPanResponderRelease: end,
    onPanResponderTerminate: end,
  });
  return {
    panHandlers: responder.panHandlers,
    updateCallbacks(nextCallbacks: ResizeCallbacks) {
      if (callbacks.direction !== nextCallbacks.direction) lastDelta = 0;
      callbacks = nextCallbacks;
    },
  };
}
