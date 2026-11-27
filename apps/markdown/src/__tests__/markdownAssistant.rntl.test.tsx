import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { getDirectory } from "@legendapp/spark/files";
import { resolveCommand, runCommand } from "@legendapp/spark/processes";
import { createMarkdownAssistant, parseAssistantReply, readAssistantSettings, runAssistantModel, type AssistantSettings } from "../markdownAssistant";
import { MarkdownAssistantPanel } from "../MarkdownAssistantPanel";
import {
  setMarkdownContentWidthSetting,
  setMarkdownDocumentDensitySetting,
  setMarkdownFontFamilySetting,
  setMarkdownFontSizeSetting,
  setMarkdownFormattingToolbarModeSetting,
  setMarkdownLineHeightSetting,
} from "../markdownSettings";

jest.mock("@legendapp/spark/processes", () => ({ resolveCommand: jest.fn(), runCommand: jest.fn() }));
jest.mock("@legendapp/spark/files", () => ({ getDirectory: jest.fn(async () => "/app-data"), watch: jest.fn() }));

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

/** Spark's native AppKit Button, mocked as a host component, found by its title. */
function nativeButton(view: Awaited<ReturnType<typeof render>>, title: string) {
  const [button] = view.container.queryAll(node => node.type === "NativeButton" && node.props.title === title);
  if (!button) throw new Error(`No ${title} button`);
  return button;
}

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
    ["no changes object", JSON.stringify({ message: "ok" })],
    ["an object inside prose", `Here you go: ${JSON.stringify({ message: "ok", changes: { fontFamily: "serif" } })} Enjoy!`],
    ["a fenced block inside prose", "Sure:\n```json\n" + JSON.stringify({ message: "ok", changes: {} }) + "\n```"],
  ])("rejects %s", (_name, output) => {
    expect(() => parseAssistantReply(output, defaults)).toThrow();
  });

  it("reads one whole JSON or fenced reply and keeps only real changes", () => {
    expect(parseAssistantReply("```json\n" + JSON.stringify({ message: "Done.", changes: { fontFamily: "serif", fontSize: "default" } }) + "\n```", defaults))
      .toEqual({ message: "Done.", changes: [{ key: "fontFamily", from: "system", to: "serif" }] });
    expect(parseAssistantReply(JSON.stringify({ message: "I can only change editor preferences.", changes: {} }), defaults))
      .toEqual({ message: "I can only change editor preferences.", changes: [] });
  });
});

describe("runAssistantModel", () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const exited = (stdout: string, stderr = "", code = 0) => ({ aborted: false, exit: { type: "exited", code }, outputTruncated: false, stderr: encode(stderr), stdout: encode(stdout), timedOut: false });

  it("runs only Claude with no tools, MCP, settings or plugins and the prompt on stdin", async () => {
    (resolveCommand as jest.Mock).mockResolvedValue("/usr/local/bin/claude");
    (runCommand as jest.Mock).mockResolvedValue(exited("{\"message\":\"ok\",\"changes\":{}}"));
    await expect(runAssistantModel("the prompt", new AbortController().signal)).resolves.toBe("{\"message\":\"ok\",\"changes\":{}}");
    expect(runCommand).toHaveBeenLastCalledWith(expect.objectContaining({
      args: ["-p", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence"],
      cwd: "/app-data",
      input: "the prompt",
      target: { type: "command", name: "claude" },
    }));
    // Only Claude is looked up; Codex is never probed.
    expect((resolveCommand as jest.Mock).mock.calls).toEqual([["claude"]]);
  });

  it("does not fall back to Codex", async () => {
    (runCommand as jest.Mock).mockClear();
    (resolveCommand as jest.Mock).mockImplementation(async (name: string) => name === "codex" ? "/usr/local/bin/codex" : null);
    await expect(runAssistantModel("the prompt", new AbortController().signal)).rejects.toThrow("Install the Claude command-line tool");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("never reads a reply from stderr", async () => {
    (resolveCommand as jest.Mock).mockResolvedValue("/usr/local/bin/claude");
    const reply = JSON.stringify({ message: "ok", changes: { fontFamily: "serif" } });
    (runCommand as jest.Mock).mockResolvedValue(exited("", reply));
    const output = await runAssistantModel("the prompt", new AbortController().signal);
    expect(() => parseAssistantReply(output, defaults)).toThrow();
    (runCommand as jest.Mock).mockResolvedValue(exited("", "not signed in", 1));
    await expect(runAssistantModel("the prompt", new AbortController().signal)).rejects.toThrow("not signed in");
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

    assistant.apply(assistant.state$.messages.peek().at(-1)!.id);

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
    const { id } = assistant.state$.messages.peek().at(-1)!;

    assistant.discard(id);

    expect(readAssistantSettings()).toEqual({ ...defaults, fontSize: "small" });
    expect(assistant.preview$.get()).toBeUndefined();
    expect(assistant.state$.messages.peek().at(-1)?.proposal?.status).toBe("discarded");
    assistant.apply(id);
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
    expect(assistant.state$.messages.peek()).toEqual([]);
    assistant.setShowAfter(true);
    expect(assistant.preview$.get()).toBeUndefined();
    expect(readAssistantSettings()).toEqual(defaults);

    const failure = deferred();
    const second = createMarkdownAssistant({ run: () => failure.promise });
    const failed = second.send("again");
    second.close();
    failure.reject(new Error("Cancelled."));
    await failed;
    expect(second.state$.messages.peek()).toEqual([]);
  });

  it("leaves a turn cancelled by close out of later requests, even when its reply arrives late", async () => {
    const first = deferred();
    const run = jest.fn((_prompt: string, _signal: AbortSignal) => Promise.resolve(longForm)).mockReturnValueOnce(first.promise);
    const assistant = createMarkdownAssistant({ run });
    const cancelled = assistant.send("Use a monospaced font");
    assistant.close();
    await assistant.send("Make it calmer");
    first.resolve(JSON.stringify({ message: "Mono.", changes: { fontFamily: "mono" } }));
    await cancelled;

    expect(run.mock.calls[1]![0]).not.toContain("monospaced");
    expect(assistant.state$.messages.peek().map(message => message.text)).toEqual(["Make it calmer", "Here are 4 settings changes. Switch to After to see them in the editor."]);
    expect(assistant.state$.pending.peek()).toBe(false);
  });

  it("ignores actions from a card that is no longer the open proposal", async () => {
    const replies = [longForm, JSON.stringify({ message: "Bigger.", changes: { fontSize: "xlarge" } })];
    const assistant = createMarkdownAssistant({ run: async () => replies.shift()! });
    await assistant.send("long-form");
    const older = assistant.state$.messages.peek().at(-1)!.id;
    await assistant.send("bigger");
    const newer = assistant.state$.messages.peek().at(-1)!.id;

    assistant.apply(older);
    assistant.discard(older);
    expect(readAssistantSettings()).toEqual(defaults);
    expect(assistant.state$.messages.peek().at(-1)?.proposal?.status).toBe("open");

    assistant.apply(newer);
    expect(readAssistantSettings()).toEqual({ ...defaults, fontSize: "xlarge" });
  });

  it("applies nothing when a reviewed setting changed after the proposal", async () => {
    const assistant = createMarkdownAssistant({ run: async () => longForm });
    await assistant.send("long-form");
    const { id } = assistant.state$.messages.peek().at(-1)!;
    setMarkdownFontSizeSetting("small");

    assistant.apply(id);

    expect(readAssistantSettings()).toEqual({ ...defaults, fontSize: "small" });
    expect(assistant.state$.messages.peek().at(-2)?.proposal?.status).toBe("discarded");
    expect(assistant.state$.messages.peek().at(-1)).toMatchObject({ role: "error", text: "Font Size changed since this proposal, so nothing was applied. Ask again for a fresh proposal." });
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
  expect(view.getByLabelText("Font: Theme to Serif").props.accessible).toBe(true);
  expect(view.getByLabelText("Formatting Toolbar: Top to Floating")).toBeTruthy();

  const segmented = () => view.container.queryAll(node => node.type === "NativeSegmentedControl")[0]!;
  await fireEvent(segmented(), "valueChange", { nativeEvent: { value: "1" } });
  expect(assistant.preview$.get()?.fontFamily).toBe("serif");
  await fireEvent(nativeButton(view, "Discard"), "buttonPress");
  expect(assistant.preview$.get()).toBeUndefined();
  expect(view.getByText("Discarded")).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText("Ask Assistant"), "Again");
  await fireEvent.press(view.getByLabelText("Send"));
  await fireEvent(await waitFor(() => nativeButton(view, "Apply 4 changes")), "buttonPress");
  expect(readAssistantSettings()).toMatchObject({ contentWidth: "narrow", fontFamily: "serif", fontSize: "large", formattingToolbarMode: "selection" });
  expect(view.getByText("Applied")).toBeTruthy();
  await view.unmount();
});

it("keeps each card's buttons on its own proposal and reports composer focus", async () => {
  const replies = [longForm, JSON.stringify({ message: "Bigger.", changes: { fontSize: "xlarge" } })];
  const assistant = createMarkdownAssistant({ run: async () => replies.shift()! });
  const view = await render(<MarkdownAssistantPanel assistant={assistant} onClose={jest.fn()} />);
  const composer = view.getByLabelText("Ask Assistant");

  await fireEvent(composer, "focus");
  expect(assistant.state$.composerFocused.peek()).toBe(true);
  await fireEvent.changeText(composer, "long-form");
  await fireEvent(composer, "submitEditing");
  const olderApply = await waitFor(() => nativeButton(view, "Apply 4 changes"));
  await fireEvent.changeText(composer, "bigger");
  await fireEvent(composer, "submitEditing");
  await waitFor(() => nativeButton(view, "Apply 1 change"));
  await fireEvent(olderApply, "buttonPress");
  expect(readAssistantSettings()).toEqual(defaults);
  await fireEvent(composer, "blur");
  expect(assistant.state$.composerFocused.peek()).toBe(false);
  await view.unmount();
});
