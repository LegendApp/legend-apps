---
name: verify-markdown
description: Launch Legend Markdown on macOS, drive it like a user, and collect screenshot and log evidence that a change works. Use when verifying or debugging Legend Markdown behavior at runtime, including from verify-hardcore.
---

# Verify Legend Markdown

Run from the `legend-apps` checkout. [docs/agent-runtime.md](../../docs/agent-runtime.md) has the full `agent-device` reference; this skill is the short path for Markdown. Never run release builds.

## Launch

Close any running Legend Markdown first; otherwise `run` only focuses the old process. Start the debug build and Metro under the app lock in a detached tmux session, so the lock is held for the whole verification:

```sh
tmux new-session -d -s verify-markdown "zsh -ic '~/devroot/scripts/app-lock legend-markdown -- bun run markdown run macos > /tmp/verify-markdown.log 2>&1'"
```

Ready when `curl -s http://localhost:19092/status` prints `packager-status:running` and the app window is open. Then bind a session:

```sh
agent-device open so.legend.markdown.macos --session md --platform macos --surface app
```

## Doctor

Read-only checks before driving:

- Exactly one Legend Markdown process, running from `shell/.legend/spark/markdown/.spark/products/macos-<arch>/dev/`, not `release/`: `ps -axo pid,lstart,command | grep -E "Legend Markdown|so.legend.markdown"`.
- Metro answers on port 19092, not 8081.
- `tail /tmp/verify-markdown.log` shows no install or build error. If `bun install` fails, stop and report it; do not change permissions or dependencies to get past it.
- `agent-device logs path --session md` reports `active=true`.

## Drive

- Map the UI once with `agent-device snapshot -i --session md`, then act with `press`, `fill`, `type`, and `scroll`, re-snapshotting after each change.
- Stable targets: the editor surface `markdown-document-input-surface`; labelled controls `Display Theme`, `Layout Theme`, `Autosave`, `Link URL`, `Apply`, `Cancel`, `Comment`.
- For JS-only changes, reload with `agent-device metro reload --session md --platform macos --metro-port 19092` instead of relaunching.
- Dismiss a LogBox or RedBox with `agent-device react-native dismiss-overlay --session md` before interacting.
- Once a flow is known, save it as an `agent-device batch --steps-file <path> --session md` file so it reruns identically.

## Evidence

- Bracket the repro: `agent-device logs clear --restart --session md`, `logs mark "before"`, drive the flow, `logs mark "after"`, then `logs path`.
- Screenshot the result with `agent-device --session md screenshot <path>`; add a before screenshot when the change is visual.
- Check the side effect a user would see, such as the saved file contents on disk, not just the UI.
- Report the screenshot and log paths, what each shows, and anything not verified.

## Cleanup

```sh
tmux kill-session -t verify-markdown
```

This stops Metro and releases the lock, which quits the app it launched. Confirm with `~/devroot/scripts/app-lock --status` and the `ps` check above. Delete temporary documents you created.
