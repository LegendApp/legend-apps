# Markdown app regression testing

## Commands

- `bun run test:markdown-app`: app UI, document-session workflows, menus, settings, themes, and launch parsing. This is the descriptive alias for the existing `test:markdown-toolbar` command, which runs the entire app Jest configuration.
- `bun run test:markdown-regression`: parser, document integration, app, native selection/paste/layout, vendored list regressions, typecheck, and macOS configuration verification. Run this before shipping Markdown changes on macOS.
- `bun run test:markdown-editing:all`: the regression command plus the native app UI scenarios. Requires an unlocked macOS desktop and the repository's `agent-device` setup; see [agent runtime](agent-runtime.md). Close the Markdown app first, saving any work, so launch arguments start a fresh test session.
- `bun run test:markdown-e2e:large-document`: native large-document scenario alone. Use `MARKDOWN_E2E_SKIP_BUILD=1` with an up-to-date debug binary and Metro already running.

## Coverage and evidence

| Layer | Real scenarios | Boundary |
| --- | --- | --- |
| App session and UI | Open/new/close/quit cancellation; failed saves and retries; untitled Save As cancellation; Save As permission failures; duplicate dialogs; load errors; external changes/deletion; conflict actions; settings and toolbar commands | Runs real app hooks/components with mocked OS dialogs, file services, and editor command boundaries |
| Document integration | Text/structural edits, selections, paste, formatting, undo/redo, save races, stale hydration, external conflicts, keyboard navigation | Runs document logic with simulated native inputs and list geometry; does not prove native rendering |
| Native parser | Document transactions and parser behavior | C++ tests with the real parser |
| Native editor | Selection, paste caret placement, code layout and pixel checks, large code viewports | Native component tests; not complete app workflows |
| Native app scenarios | Editing, selections, code blocks, navigation, theme changes, and large documents | Actual native parser/editor/list; requires desktop automation |

The large-document fixture contains 16,002 blocks and more than 10 MB of Markdown, mixing headings, code, Unicode, and variable-length paragraphs. It keeps edits in memory with autosave disabled. Its saved UI flow checks actual destination text, edits the last block, checks undo/redo results, and repeatedly returns to the first and last blocks. It does not use a timer-generated “passed” label as its assertion.

The boundary-navigation integration regressions explicitly model an unmounted destination. Removing the call that prepares that destination makes both tests fail.

## Remaining limits

The large-document flow exercises programmatic jumps. It does not automate physical scrollbar-thumb dragging or assert that every intermediate rendered frame is nonblank. Accessibility text can also exist outside the visible viewport, so native screenshots remain useful evidence. Existing timer-driven smoke scenarios should not be interpreted as complete correctness checks.

During implementation, the large-document actions and text assertions were exercised in the native app using CUA, including screenshots. The saved `agent-device` batch was authored but was not executed through that runner in that session. Run the UI command above in its configured environment before treating the batch itself as validated.
