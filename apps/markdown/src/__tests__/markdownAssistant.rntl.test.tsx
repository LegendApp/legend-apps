import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { createMarkdownAssistant, parseAssistantReply, readAssistantSettings, type AssistantSettings } from "../markdownAssistant";
import { MarkdownAssistantPanel } from "../MarkdownAssistantPanel";
import {
  setMarkdownContentWidthSetting,
  setMarkdownDocumentDensitySetting,
  setMarkdownFontFamilySetting,
  setMarkdownFontSizeSetting,
  setMarkdownFormattingToolbarModeSetting,
  setMarkdownLineHeightSetting,
} from "../markdownSettings";

jest.mock("@legendapp/spark/processes", () => ({ runCommand: jest.fn() }));

const defaults: AssistantSettings = { contentWidth: "standard", density: "comfortable", fontFamily: "system", fontSize: "default", formattingToolbarMode: "top", lineHeight: "normal" };
const longForm = JSON.stringify({
  message: "Here are 4 settings changes. Switch to After to see them in the editor.",
  changes: { fontFamily: "serif", fontSize: "large", contentWidth: "narrow", formattingToolbarMode: "selection" },
});

beforeEach(() => {
  setMarkdownContentWidthSetting(defaults.contentWidth);
  setMarkdownDocumentDensitySetting(defaults.density);
  setMarkdownFontFamilySetting(defaults.fontFamily);
  setMarkdownFontSizeSetting(defaults.fontSize);
  setMarkdownFormattingToolbarModeSetting(defaults.formattingToolbarMode);
  setMarkdownLineHeightSetting(defaults.lineHeight);
});

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  return { promise, reject, resolve };
}

describe("parseAssistantReply", () => {
  it.each([
    ["prose", "Sure, I made it serif."],
    ["no message", JSON.stringify({ changes: { fontFamily: "serif" } })],
    ["changes as a list", JSON.stringify({ message: "ok", changes: [["fontFamily", "serif"]] })],
    ["an unknown setting", JSON.stringify({ message: "ok", changes: { autosave: "disabled" } })],
    ["an invalid value", JSON.stringify({ message: "ok", changes: { fontSize: "huge" } })],
  ])("rejects %s", (_name, output) => {
    expect(() => parseAssistantReply(output, defaults)).toThrow();
  });

  it("reads fenced JSON, keeps only real changes and allows a reply without changes", () => {
    expect(parseAssistantReply("```json\n" + JSON.stringify({ message: "Done.", changes: { fontFamily: "serif", fontSize: "default" } }) + "\n```", defaults))
      .toEqual({ message: "Done.", changes: [{ key: "fontFamily", from: "system", to: "serif" }] });
    expect(parseAssistantReply(JSON.stringify({ message: "I can only change editor preferences." }), defaults))
      .toEqual({ message: "I can only change editor preferences.", changes: [] });
  });
});

describe("createMarkdownAssistant", () => {
  it("sends only settings and the conversation, and previews without writing", async () => {
    const run = jest.fn(async (_prompt: string, _signal: AbortSignal) => longForm);
    const assistant = createMarkdownAssistant({ run });
    await assistant.send("Make this nicer for long-form writing");

    const prompt = run.mock.calls[0]![0];
    expect(prompt).toContain(JSON.stringify(readAssistantSettings()));
    expect(prompt).toContain("User: Make this nicer for long-form writing");
    expect(assistant.preview$.get()).toBeUndefined();

    assistant.setShowAfter(true);
    expect(assistant.preview$.get()).toEqual({ contentWidth: "narrow", fontFamily: "serif", fontSize: "large", formattingToolbarMode: "selection" });
    expect(readAssistantSettings()).toEqual(defaults);

    assistant.setShowAfter(false);
    expect(assistant.preview$.get()).toBeUndefined();
  });

  it("applies only the reviewed fields and keeps a concurrent edit to another setting", async () => {
    const assistant = createMarkdownAssistant({ run: async () => longForm });
    await assistant.send("long-form");
    assistant.setShowAfter(true);
    setMarkdownLineHeightSetting("relaxed");

    assistant.apply();

    expect(readAssistantSettings()).toEqual({ ...defaults, contentWidth: "narrow", fontFamily: "serif", fontSize: "large", formattingToolbarMode: "selection", lineHeight: "relaxed" });
    expect(assistant.preview$.get()).toBeUndefined();
    expect(assistant.state$.messages.peek().at(-1)?.proposal?.status).toBe("applied");
    assistant.setShowAfter(true);
    expect(assistant.preview$.get()).toBeUndefined();
  });

  it("discards without writing or undoing an edit made while previewing", async () => {
    const assistant = createMarkdownAssistant({ run: async () => longForm });
    await assistant.send("long-form");
    assistant.setShowAfter(true);
    setMarkdownFontSizeSetting("small");

    assistant.discard();

    expect(readAssistantSettings()).toEqual({ ...defaults, fontSize: "small" });
    expect(assistant.preview$.get()).toBeUndefined();
    expect(assistant.state$.messages.peek().at(-1)?.proposal?.status).toBe("discarded");
    assistant.apply();
    expect(readAssistantSettings()).toEqual({ ...defaults, fontSize: "small" });
  });

  it("drops a reply or failure that arrives after close", async () => {
    const reply = deferred();
    const assistant = createMarkdownAssistant({ run: () => reply.promise });
    const sent = assistant.send("long-form");
    expect(assistant.state$.pending.peek()).toBe(true);

    assistant.close();
    reply.resolve(longForm);
    await sent;

    expect(assistant.state$.pending.peek()).toBe(false);
    expect(assistant.state$.messages.peek().map(message => message.role)).toEqual(["user"]);
    assistant.setShowAfter(true);
    assistant.apply();
    expect(assistant.preview$.get()).toBeUndefined();
    expect(readAssistantSettings()).toEqual(defaults);

    const failure = deferred();
    const second = createMarkdownAssistant({ run: () => failure.promise });
    const failed = second.send("again");
    second.close();
    failure.reject(new Error("Cancelled."));
    await failed;
    expect(second.state$.messages.peek().map(message => message.role)).toEqual(["user"]);
  });

  it("settles the open proposal when a newer one arrives and shows model errors", async () => {
    const replies = [longForm, JSON.stringify({ message: "Bigger.", changes: { fontSize: "xlarge" } })];
    const assistant = createMarkdownAssistant({ run: async () => replies.shift() ?? "not json" });
    await assistant.send("long-form");
    assistant.setShowAfter(true);
    await assistant.send("bigger");

    expect(assistant.state$.messages.peek().map(message => message.proposal?.status)).toEqual([undefined, "discarded", undefined, "open"]);
    expect(assistant.preview$.get()).toBeUndefined();

    await assistant.send("third");
    expect(assistant.state$.messages.peek().at(-1)).toMatchObject({ role: "error", text: "The Assistant's reply was not in the expected format." });
    expect(readAssistantSettings()).toEqual(defaults);
  });
});

it("runs send, After, Discard, then send and Apply through the panel", async () => {
  const assistant = createMarkdownAssistant({ run: async () => longForm });
  const view = await render(<MarkdownAssistantPanel assistant={assistant} onClose={jest.fn()} />);

  await fireEvent.changeText(view.getByLabelText("Ask Assistant"), "Make this nicer for long-form writing");
  await fireEvent(view.getByLabelText("Ask Assistant"), "submitEditing");
  await view.findByText("Here are 4 settings changes. Switch to After to see them in the editor.");
  expect(view.getByLabelText("Font: Theme to Serif")).toBeTruthy();
  expect(view.getByLabelText("Formatting Toolbar: Top to Floating")).toBeTruthy();

  const segmented = () => view.container.queryAll(node => node.type === "NativeSegmentedControl")[0]!;
  await fireEvent(segmented(), "valueChange", { nativeEvent: { value: "1" } });
  expect(assistant.preview$.get()?.fontFamily).toBe("serif");
  await fireEvent.press(view.getByText("Discard"));
  expect(assistant.preview$.get()).toBeUndefined();
  expect(view.getByText("Discarded")).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText("Ask Assistant"), "Again");
  await fireEvent.press(view.getByLabelText("Send"));
  await fireEvent.press(await view.findByText("Apply 4 changes"));
  expect(readAssistantSettings()).toMatchObject({ contentWidth: "narrow", fontFamily: "serif", fontSize: "large", formattingToolbarMode: "selection" });
  expect(view.getByText("Applied")).toBeTruthy();
  await view.unmount();
});
