import { act, fireEvent, render } from "@testing-library/react-native";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import React from "react";
import { MarkdownOpenFilePanel } from "../MarkdownOpenFilePanel";

const mockTree: Record<string, string | null> = {
  "/notes": null,
  "/notes/todo.md": "",
  "/notes/image.png": "",
  "/notes/archive": null,
  "/notes/archive/old.md": "",
  "/work": null,
  "/work/todo.md": "",
};
let mockHeld: ((value: { name: string; path: string }[]) => void) | null = null;

jest.mock("@legendapp/spark/files", () => ({
  list: jest.fn(async (directory: string) => {
    const entries = Object.keys(mockTree)
      .filter(path => path.startsWith(`${directory}/`) && !path.slice(directory.length + 1).includes("/"))
      .map(path => ({ name: path.slice(directory.length + 1), path }));
    return directory === "/held" ? new Promise(resolve => { mockHeld = resolve; }) : entries;
  }),
  readText: jest.fn(async () => ""),
  stat: jest.fn(async (path: string) => ({ type: mockTree[path] === null ? "directory" : "file" })),
}));
const mockFocus = jest.fn();
const mockScrollTo = jest.fn();
let mockScrollLayout: ((event: object) => void) | undefined;
// The search field is focused through its ref once the panel mounts, and the results scroll through theirs.
jest.mock("@legendapp/spark/ui/search", () => {
  const React = require("react");
  return {
    TextInputSearch: React.forwardRef((props: object, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ focus: mockFocus }));
      return React.createElement("TextInputSearch", props);
    }),
  };
});
jest.mock("react-native", () => {
  const React = require("react");
  const actual = jest.requireActual("react-native");
  return {
    ...actual,
    ScrollView: React.forwardRef((props: { onLayout?: (event: object) => void }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      mockScrollLayout = props.onLayout;
      return React.createElement(actual.View, props);
    }),
  };
});
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ ...jest.requireActual("@legendapp/spark/shortcuts/commands"), createHotkeyRouter: jest.fn(() => ({})), useRoutedHotkeys: jest.fn() }));
jest.mock("../appMetadata", () => ({
  getRecentMarkdownFiles: () => [{ path: "/work/todo.md" }, { path: "/gone/x.md" }, { path: "/notes/archive/old.md" }],
}));

const handlers = () => jest.mocked(useRoutedHotkeys).mock.calls.at(-1)![0].handlers as Record<string, () => void>;
const rows = (view: Awaited<ReturnType<typeof render>>) => view.queryAllByLabelText(/./).filter(node => node.props.accessibilityRole === "menuitem")
  .map(node => `${node.props.accessibilityLabel}${node.props.accessibilityState.selected ? "*" : ""}`);

describe("MarkdownOpenFilePanel", () => {
  const props = { onBrowse: jest.fn(), onDismiss: jest.fn(), onError: jest.fn(), onOpen: jest.fn(), windowId: "w" };
  beforeEach(() => jest.clearAllMocks());

  it("lists recent files of every folder, searches all of them, and opens by keyboard", async () => {
    const view = await render(<MarkdownOpenFilePanel {...props} folders={["/notes", "/work"]} />);
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(mockFocus).toHaveBeenCalledTimes(1);
    expect(rows(view)).toEqual(["todo.md, work*", "old.md, notes/archive"]);

    await act(async () => fireEvent.changeText(view.getByLabelText("Search Markdown files"), "todo"));
    expect(rows(view)).toEqual(["todo.md, work*", "todo.md, notes"]);
    await act(async () => handlers().next());
    await act(async () => handlers().next());
    expect(rows(view)).toEqual(["todo.md, work", "todo.md, notes*"]);
    await act(async () => handlers().open());
    expect(props.onOpen).toHaveBeenCalledWith("/notes/todo.md");

    await act(async () => fireEvent.changeText(view.getByLabelText("Search Markdown files"), "image"));
    expect(rows(view)).toEqual([]);
    expect(view.getByText("No matching files")).toBeTruthy();
    await act(async () => handlers().open());
    expect(props.onOpen).toHaveBeenCalledTimes(1);

    await act(async () => handlers().dismiss());
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(view.getByText("Open File")));
    expect(props.onBrowse).toHaveBeenCalledTimes(1);
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("keeps the keyboard's row inside the results as laid out", async () => {
    const view = await render(<MarkdownOpenFilePanel {...props} folders={["/notes", "/work"]} />);
    await act(async () => mockScrollLayout!({ nativeEvent: { layout: { height: 56 } } }));
    await act(async () => fireEvent.changeText(view.getByLabelText("Search Markdown files"), "md"));
    await act(async () => handlers().next());
    expect(mockScrollTo).not.toHaveBeenCalled();
    await act(async () => handlers().next());
    expect(mockScrollTo).toHaveBeenLastCalledWith({ animated: false, y: 28 });
    await view.unmount();
  });

  it("ignores a listing that finishes after the folders change", async () => {
    mockTree["/held"] = null;
    const view = await render(<MarkdownOpenFilePanel {...props} folders={["/held"]} />);
    await view.rerender(<MarkdownOpenFilePanel {...props} folders={["/notes"]} />);
    await act(async () => {});
    await act(async () => fireEvent.changeText(view.getByLabelText("Search Markdown files"), "md"));
    expect(rows(view)).toEqual(["old.md, notes/archive*", "todo.md, notes"]);
    await act(async () => mockHeld!([{ name: "late.md", path: "/held/late.md" }]));
    expect(rows(view)).toEqual(["old.md, notes/archive*", "todo.md, notes"]);
    await view.unmount();
  });
});
