---
name: verify-markdown
description: Launch Legend Markdown on macOS, drive it like a user, and collect screenshot and log evidence that a change works. Use when verifying or debugging Legend Markdown behavior at runtime, including from verify-hardcore.
---

# Verify Legend Markdown

Run from the `legend-apps` checkout. [docs/agent-runtime.md](../../docs/agent-runtime.md) has the full `agent-device` reference; this skill is the short path for Markdown. Never run release builds.

## Launch

If Legend Markdown or a `verify-markdown` tmux session is already running, stop and report; do not quit a process you did not launch. Start the debug build and Metro under the app lock in a detached tmux session, so the lock is held until Cleanup (`zsh -ic` puts `bun` on PATH):

```sh
tmux new-session -d -s verify-markdown "zsh -ic '~/devroot/scripts/app-lock legend-markdown -- bun run markdown run macos > /tmp/verify-markdown.log 2>&1'"
```

If the log says `Reusing markdown dev server`, another session owns Metro; stop and report rather than proceeding unlocked. Ready when `curl -s http://localhost:19092/status` prints `packager-status:running` and an editor window is open. If it doesn't become ready, check `~/devroot/scripts/app-lock --status`; if another session holds `legend-markdown`, stop and report. Then bind a session:

```sh
agent-device open so.legend.markdown.macos --session md --platform macos --surface app
```

## Doctor

Read-only checks before driving:

- Exactly one Legend Markdown process, running from `shell/.legend/spark/markdown/.spark/products/macos-<arch>/dev/`, not `release/`: `pgrep -lf "LegendMarkdown|legendapp-shell-macos"`.
- `tail /tmp/verify-markdown.log` shows no install or build error. If `bun install` fails, stop and report it; do not change permissions or dependencies to get past it.
- `agent-device logs path --session md` reports `active=true`.

## Drive

- Map the UI once with `agent-device snapshot -i --session md`, then act with `press`, `fill`, `type`, and `scroll`, re-snapshotting after each change.
- Stable targets: editor `markdown-document-input-surface`; link popover `Link URL`, `Apply`, `Cancel`; `Comment`; in Settings, `Display Theme`, `Layout Theme`, `Autosave`.
- For JS-only changes, reload with `agent-device metro reload --session md --platform macos --metro-port 19092` instead of relaunching.
- Dismiss a LogBox or RedBox with `agent-device react-native dismiss-overlay --session md` before interacting.

## Evidence

- Bracket the repro: `agent-device logs clear --restart --session md`, `agent-device logs mark "before" --session md`, drive the flow, `agent-device logs mark "after" --session md`, then `agent-device logs path --session md`.
- Screenshot the result with `agent-device --session md screenshot <path>`; add a before screenshot when the change is visual.
- Check the side effect a user would see, not just the UI. The baseline path: File → New, type unique text, Save As to a temporary `.md`, read the file on disk, reopen it with File → Open, and confirm the text persists.
- Report the screenshot and log paths, what each shows, and anything not verified.

## Cleanup

```sh
tmux kill-session -t verify-markdown 2>/dev/null || true
```

This stops Metro and releases the lock; app-lock quits the app it saw launch. Confirm with `~/devroot/scripts/app-lock --status` and the `pgrep` check, and quit any Legend Markdown you launched that remains. Delete temporary documents you created.
