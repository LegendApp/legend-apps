import { openFileDialog } from "@legend-desktop/file-dialog";
import { useNativeMenu, type NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { addRecentDocumentOpenListener } from "@legend-desktop/recent-documents";
import { addWindowClosedListener, closeWindow } from "@legend-desktop/window-manager";
import { useEffect, useRef } from "react";
import { codeFileTypes, codeMenuOwnerId, codeViewerWindowIdentifier } from "./appConstants";
import { installCodeBenchmarkHook } from "./codeBenchmark";
import { getLaunchCodeFile, isCodePath } from "./codeFiles";
import { codeMenuConfig } from "./codeMenus";
import { warmCodeSyntaxHighlighters } from "./codeSyntaxWarmup";
import { openCodeViewerWindow, registerCodeWindows } from "./codeWindows";

registerCodeWindows();
installCodeBenchmarkHook();
warmCodeSyntaxHighlighters().catch(reportCodeAppControllerError);

declare global {
  var __legendCodeBenchmarkOpenFile: ((filePath: string) => Promise<void>) | undefined;
  var __legendCodeBenchmarkCloseFile: (() => Promise<void>) | undefined;
  var __legendCodeBenchmarkGetTokenizedLineCount: (() => number) | undefined;
}

type CodeAppProps = {
  launchArguments?: string[];
};

function reportCodeAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[CodeAppController] ${message}`);
}

if (__DEV__) {
  globalThis.__legendCodeBenchmarkOpenFile = (filePath: string) => openCodeViewerWindow([filePath]);
  globalThis.__legendCodeBenchmarkCloseFile = async () => {
    await closeWindow(codeViewerWindowIdentifier);
  };
}

async function openCodeViewerForSelectedFile() {
  const paths = await openFileDialog({
    allowedFileTypes: codeFileTypes,
    canChooseFiles: true,
  });
  const path = paths?.find(isCodePath) ?? null;

  if (path) {
    await openCodeViewerWindow([path]);
    return true;
  }

  if (paths && paths.length > 0) {
    throw new Error(`Choose a TypeScript file (${codeFileTypes.map((type) => `.${type}`).join(", ")}).`);
  }

  return false;
}

export function App({ launchArguments }: CodeAppProps) {
  const didOpenViewerRef = useRef(false);
  const viewerWindowOpenRef = useRef(false);
  const menuHandlers = useRef<NativeMenuActionHandlers>({
    open: () => {
      openCodeViewerForSelectedFile()
        .then((didOpen) => {
          if (didOpen) {
            viewerWindowOpenRef.current = true;
          }
        })
        .catch(reportCodeAppControllerError);
    },
  }).current;

  useNativeMenu({
    handlers: menuHandlers,
    menus: codeMenuConfig,
    ownerId: codeMenuOwnerId,
  });

  useEffect(() => {
    const subscription = addRecentDocumentOpenListener(({ path }) => {
      if (isCodePath(path)) {
        openCodeViewerWindow([path])
          .then(() => {
            viewerWindowOpenRef.current = true;
          })
          .catch(reportCodeAppControllerError);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = addWindowClosedListener((event) => {
      if (event.identifier === codeViewerWindowIdentifier) {
        viewerWindowOpenRef.current = false;
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!didOpenViewerRef.current) {
      didOpenViewerRef.current = true;
      const launchFile = getLaunchCodeFile(launchArguments);
      openCodeViewerWindow(launchFile ? [launchFile] : launchArguments)
        .then(() => {
          viewerWindowOpenRef.current = true;
        })
        .catch(reportCodeAppControllerError);
    }
  }, [launchArguments]);

  return null;
}

export default App;
