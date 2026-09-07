## Optional UI Verification With Agent Device

Use `agent-device` when the user requests runtime debugging or verification. That request authorizes the necessary scoped local inspection and reruns; do not ask again at each step. Prefer code inspection, focused unit tests, typecheck, and targeted non-runtime verification by default.

When the user does ask for macOS app inspection with `agent-device`, prefer an app-scoped session, which captures and targets the app window without foregrounding the app or disrupting the user's desktop:

- Open or bind a macOS app session with `agent-device open <app> --platform macos --surface app`.
- Capture app-window screenshots with `agent-device --session <name> screenshot <path>`.
- Use `--fullscreen` only when the whole desktop is intentionally needed.
- Prefer `agent-device snapshot`, `screenshot`, `diff`, `logs`, `network dump`, `perf`, `metro reload`, `react-native dismiss-overlay`, `react-devtools`, and session management over manual `open -a`, AppleScript foregrounding, raw screen captures, or ad hoc UI poking.
- Do not use `--surface frontmost-app`, desktop-wide capture, `open -a`, AppleScript activation, or manual foregrounding unless the task explicitly requires the frontmost app or a focus-dependent interaction.
- Prefer read-only evidence first: `snapshot`, `logs`, `perf`, process checks, and Metro/React DevTools inspection. Treat `press`, `fill`, `type`, `scroll`, and app relaunches as focus-changing actions that should only be used when needed for the repro or validation.
- For JS-only changes with Metro connected, prefer `agent-device metro reload --session <name>` instead of restarting the app.
- For LogBox or RedBox overlays, use `agent-device react-native dismiss-overlay --session <name>` before interacting with the covered UI.
- For debugging, keep evidence windows small: `agent-device logs clear --restart --session <name>`, `agent-device logs mark "before repro" --session <name>`, reproduce with `press`/`fill`/`type`/`scroll`/`wait`, then `agent-device logs mark "after repro" --session <name>` and `agent-device logs path --session <name>`.
- For first-time exploration, use one-at-a-time `agent-device snapshot -i --session <name>` and targeted commands so refs and UI state stay grounded after each mutation.
- When a repro or verification path is known, prefer an `agent-device batch --steps-file <path> --session <name>` flow over one-off commands. Keep batch steps stable with selectors, visible text waits, and app-defined e2e launch arguments rather than session-specific refs whenever possible.

### Runtime Logs With Agent Device

When the user explicitly asks for React Native macOS app runtime debugging, do not rely on Metro output for runtime logs. Metro often only shows bundling status, and JS `console.info` may be routed to React Native DevTools instead of the app log.

Use the normal `agent-device logs clear --restart` / `mark before` / repro / `mark after` / `logs path` loop above, with these extra checks when logs are empty or confusing:

- Verify there is exactly one current debug app process, and that it comes from `DerivedData/.../Build/Products/Debug/...`, not `shell/.legend/workspaces/release/...`.
- Bind with `agent-device open <bundle-id-or-app-name> --session <name> --platform macos --surface app` and verify the process path separately. Avoid `--surface frontmost-app` unless the user is explicitly asking to inspect whichever app is currently frontmost.
- If `app.log` only contains `agent-device` markers, confirm `logs path` reports `active=true`, the debug prefix was emitted after `logs clear --restart`, and the session is bound to the correct app.
- For temporary instrumentation that must be visible in `agent-device logs` on macOS, prefer native unified logging with the app bundle id subsystem, for example `os_log_create("so.legend.markdown.macos", "debug-category")`. Plain `NSLog` can be missed by the app-scoped filter.
- If JS-side timing is required and app logs do not include it, try `agent-device react-devtools ...` before falling back to file-backed logging.

### macOS Dev App Pitfalls

For current-code testing, launch the app with the repo scripts before binding `agent-device`:

- `bun music run` for Music.
- `bun markdown run` for Markdown.

Before a native rebuild/relaunch, close the running app first. If the app is already running, the build/run script may only focus the old process, so the rebuilt native code will not be loaded.

Do not rely on `agent-device open <bundle-id>` as the primary way to launch current code. For generated macOS apps it can bind to a stale release build under `shell/.legend/workspaces/release/...`, which will not contain current JS/native changes. After launching, verify the running process when behavior or logs look stale:

- `ps -axo pid,lstart,command | rg "legendapp-shell-macos|Legend Markdown|Legend Music|so.legend.(music|markdown)"`
- Debug/current builds should run from Xcode `DerivedData/.../Build/Products/Debug/legendapp-shell-macos.app/...`.
- Stale release builds usually run from `shell/.legend/workspaces/release/<app>/macos/.../<Display Name>.app/...`.

The app-specific Metro ports are defined in `scripts/lib/apps.ts`; do not assume `8081`:

- Music: `19091`.
- Markdown: `19092`.
- Test Kitchen Sink: `19093`.

Before reloading JS, confirm the active port with `curl http://localhost:<port>/status` or `lsof -nP -iTCP -sTCP:LISTEN | rg "node|bun|metro|19091|19092|19093"`. Use the explicit port with agent-device:

- `agent-device metro reload --session <name> --platform macos --metro-port 19091` for Music.
- `agent-device metro reload --session <name> --platform macos --metro-port 19092` for Markdown.

If `agent-device logs path` returns an `app.log` that only contains the filter banner or stays tiny after a repro, do not conclude that runtime logs are absent. First verify the process path is the debug app, the log stream is active, and the session is bound to the correct running app. A sparse macOS snapshot with `0 nodes` is also not enough evidence by itself; use process path, screenshots, Metro status, and logs together.
