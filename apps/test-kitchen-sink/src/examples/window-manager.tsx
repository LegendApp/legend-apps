import {
  addMainWindowMovedListener,
  addMainWindowResizedListener,
  addWindowClosedListener,
  addWindowFocusedListener,
  closeWindow,
  getMainWindowFrame,
  openWindow,
  setMainWindowFrame,
  setWindowBlur,
  setWindowTitle,
  showMainWindow,
  WindowStyleMask,
  type WindowFrame,
  type WindowResult,
} from "@legend-desktop/window-manager";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ExampleButton, styles } from "./shared";

function formatWindowResult(result: WindowResult) {
  return result.success ? "Success" : (result.message ?? "Failed");
}

function formatFrame(frame: WindowFrame) {
  return `${Math.round(frame.x)}, ${Math.round(frame.y)} ${Math.round(frame.width)}x${Math.round(frame.height)}`;
}

export function WindowManagerExample({
  childIdentifier,
  childModuleName,
}: {
  childIdentifier: string;
  childModuleName: string;
}) {
  const [status, setStatus] = useState("Open a child window to test WindowManager.");
  const [lastFrame, setLastFrame] = useState<WindowFrame | null>(null);

  useEffect(() => {
    const closed = addWindowClosedListener((event) => {
      setStatus(`Closed: ${event.identifier}`);
    });
    const focused = addWindowFocusedListener((event) => {
      setStatus(`Focused: ${event.identifier} (${event.moduleName ?? "unknown"})`);
    });
    const moved = addMainWindowMovedListener((frame) => {
      setLastFrame(frame);
    });
    const resized = addMainWindowResizedListener((frame) => {
      setLastFrame(frame);
    });
    void getMainWindowFrame().then(setLastFrame);
    return () => {
      closed.remove();
      focused.remove();
      moved.remove();
      resized.remove();
    };
  }, []);

  return (
    <View style={styles.windowManagerPanel}>
      <Text style={styles.panelTitle}>Window Manager</Text>
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.bodyText}>Main frame: {lastFrame ? formatFrame(lastFrame) : "Unknown"}</Text>
      <ScrollView contentContainerStyle={styles.windowManagerControls} style={styles.windowManagerScroll}>
        <ExampleButton
          onPress={() => {
            void openWindow({
              identifier: childIdentifier,
              moduleName: childModuleName,
              title: "Window Manager Child",
              initialProperties: {
                detail: "Opened from the kitchen sink WindowManager test.",
                title: "Window Manager Child",
              },
              windowStyle: {
                hasToolbar: true,
                height: 300,
                mask: [
                  WindowStyleMask.Titled,
                  WindowStyleMask.Closable,
                  WindowStyleMask.Miniaturizable,
                  WindowStyleMask.Resizable,
                  WindowStyleMask.FullSizeContentView,
                ],
                minHeight: 220,
                minWidth: 320,
                titlebarAppearsTransparent: true,
                titlebarMaterial: "glass",
                titlebarSeparatorStyle: "none",
                titleVisibility: "visible",
                toolbarStyle: "unified",
                width: 460,
              },
            }).then((result) => setStatus(`Open child: ${formatWindowResult(result)}`));
          }}
        >
          Open Child Window
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void openWindow({
              animateFrameChange: true,
              frameAnimationDurationMs: 220,
              identifier: childIdentifier,
              moduleName: childModuleName,
              title: "Window Manager Child Updated",
              initialProperties: {
                detail: `Updated at ${new Date().toLocaleTimeString()}`,
                title: "Updated Child Window",
              },
              windowStyle: {
                height: 360,
                minHeight: 240,
                minWidth: 360,
                width: 540,
              },
            }).then((result) => setStatus(`Update child: ${formatWindowResult(result)}`));
          }}
        >
          Update Existing Window
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void setWindowTitle(childIdentifier, "Renamed from JS").then((result) => {
              setStatus(`Set title: ${formatWindowResult(result)}`);
            });
          }}
        >
          Rename Child
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void setWindowBlur(childIdentifier, 8, 250).then((result) => {
              setStatus(`Blur child: ${formatWindowResult(result)}`);
            });
          }}
        >
          Blur Child
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void setWindowBlur(childIdentifier, 0, 250).then((result) => {
              setStatus(`Clear blur: ${formatWindowResult(result)}`);
            });
          }}
        >
          Clear Blur
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void closeWindow(childIdentifier).then((result) => {
              setStatus(`Close child: ${formatWindowResult(result)}`);
            });
          }}
        >
          Close Child
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void showMainWindow().then((result) => {
              setStatus(`Show main: ${formatWindowResult(result)}`);
            });
          }}
        >
          Show Main Window
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void getMainWindowFrame().then((frame) => {
              setLastFrame(frame);
              setStatus(`Read main frame: ${formatFrame(frame)}`);
            });
          }}
        >
          Read Main Frame
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void getMainWindowFrame().then((frame) => {
              const nextFrame = {
                ...frame,
                height: Math.max(520, Math.round(frame.height)),
                width: Math.max(760, Math.round(frame.width)),
              };
              return setMainWindowFrame(nextFrame).then((result) => {
                setLastFrame(nextFrame);
                setStatus(`Set main frame: ${formatWindowResult(result)}`);
              });
            });
          }}
        >
          Normalize Main Size
        </ExampleButton>
      </ScrollView>
    </View>
  );
}
