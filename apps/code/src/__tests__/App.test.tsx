import React from "react";
import { act, create } from "react-test-renderer";
import { useDocumentAppController } from "@legendapp/spark/app/documents";
import { App } from "../App";
import { focusCodeViewerWindow, openCodeViewerWindow } from "../codeWindows";
import { requestCodeViewerFile } from "../codeViewerRequests";

jest.mock("@legendapp/spark/app/documents", () => ({
  getFilename: (path: string) => path.split("/").pop(),
  useDocumentAppController: jest.fn(() => ({ status: "loading" })),
}));
jest.mock("@legend-apps/syntax-parser", () => ({ getSyntaxLanguageForPath: jest.fn() }));
jest.mock("../codeWindows", () => ({ registerCodeWindows: jest.fn(), openCodeViewerWindow: jest.fn(), focusCodeViewerWindow: jest.fn() }));
jest.mock("../codeBenchmark", () => ({ installCodeBenchmarkHook: jest.fn() }));
jest.mock("../codeMenus", () => ({ codeMenuConfig: [] }));
jest.mock("../codeViewerRequests", () => ({ codeAutomaticPairs$: require("@legendapp/state").observable(true), requestCodeViewerFile: jest.fn() }));

it("opens the requested document in a window retained across a host reload", async () => {
  jest.mocked(openCodeViewerWindow).mockRejectedValueOnce({ code: "E_ALREADY_EXISTS" });
  const controller = { setDocumentWindowOpen: jest.fn() };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<App />); });
  const options = jest.mocked(useDocumentAppController).mock.lastCall![0];
  await options.onInitialOpen!(["/tmp/requested.ts"], controller as any);
  expect(requestCodeViewerFile).toHaveBeenCalledWith("/tmp/requested.ts");
  expect(focusCodeViewerWindow).toHaveBeenCalledTimes(1);
  expect(controller.setDocumentWindowOpen).toHaveBeenCalledWith(true);
  const failure = new Error("native open failed");
  jest.mocked(openCodeViewerWindow).mockRejectedValueOnce(failure);
  await expect(options.onInitialOpen!([], controller as any)).rejects.toBe(failure);
  await act(async () => renderer!.unmount());
});
