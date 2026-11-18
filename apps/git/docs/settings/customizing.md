# Customizing Legend Git

Legend Git's layout, panels, theme, toolbar, context menus and key bindings come from settings files. You can change
them in **Legend Git ▸ Settings…**, by importing a shared file, by asking your own AI tool, or by editing the JSON.
Every way writes the same file, and the window updates as soon as it changes.

## Layers

Settings stack from bottom to top; a key in a higher layer wins, and a key left out inherits from below:

1. **Built-in defaults.**
2. **A preset**: SourceTree (the default), Fork or GitKraken. Pick one with *Preset* in Settings ▸ General, or
   `"extends": "fork"` in a file. Presets copy each app's arrangement and density, drawn with native macOS controls.
3. **Your settings** for every repository: `~/Library/Application Support/<Legend Git>/settings.json`.
4. **This repository's settings**, stored beside yours (`repositories/<hash>.json`), never inside the repository.

Every Settings pane opened from a repository window has an *Apply To* popup: **All Repositories** edits layer 3,
**This Repository** edits layer 4. Keys the repository overrides show **Reset to All Repositories**.

Objects merge key by key; arrays (toolbar items, columns, menu entries, lane colors, sidebar sections) and layout trees
replace whole. Divider positions, collapsed panes and window frames are window state, kept per window and never
shared.

## Settings window

| Pane | What it changes |
|---|---|
| General | preset, appearance, density; Import…, Export…, Undo Import, Reveal Settings File; the issues table |
| Layout | the active layout, Save Layout As…, Reset to Preset, a sketch of each view |
| Panels | every panel option, generated from the schema |
| Theme | code font and size, colors per appearance, graph lane colors |
| Toolbar | display mode and items: drag or Add from *Available* to *Current*, reorder with Up/Down |
| Context Menus | the same editor per menu (commit, file, branch, …) |
| Keyboard | key bindings, with conflicts shown |
| Customize with AI | describe a change; preview it; keep or revert |

View ▸ Customize Toolbar… opens the Toolbar pane.

## Sharing

**Export…** writes one `.json` file with everything, or only the layout and panels, the theme and density, or the
toolbar, menus and keys. It contains only settings the app knows: no window state, repository paths, tokens or recent
repositories. **Import…** shows what a file changes, area by area, and any keys it skips, then offers **Replace My
Settings** (your settings become the file's) or **Apply on Top** (the file's keys over yours). Your file is copied to
`settings.json.bak` first, and **Undo Import** puts it back.

Shared files name commands by id only (see [commands.md](commands.md)). They cannot run shell commands or scripts, so
importing one is safe.

## Customize with AI

Settings ▸ Customize with AI runs your own Claude or Codex command-line tool (nothing is sent to Legend). It gets the
[AI reference](ai-reference.md), the JSON Schema, your current settings, the command list and your request, and must
reply with one JSON patch. Legend Git checks the reply; if something is wrong it sends the problems back once for a
correction. The patch then shows live in the repository window as a preview: **Keep** saves it to the layer chosen in
*Apply To*, **Revert** drops it, **Show Changes** lists it. This is separate from *Customize App*, which edits the app's
source code; settings are the safe, shareable path that survives updates.

Agents outside the app can edit `settings.json` directly (the window reloads it) and check their work:

```sh
bun run git:settings check path/to/settings.json   # issues in the app's format; exits 1 on errors
```

[examples/](examples) has one file per example request, plus the three presets as shareable files.

## Resetting and recovering

- Each pane has a reset for what it shows (Reset to Preset, Reset Menu, Reset in Keyboard). Removing a key from the file
  does the same.
- A file with a JSON syntax error is skipped and left untouched; the app uses the layers below and lists the error,
  with its line and column, in Settings ▸ General ▸ Issues. Fix it in an editor, or Import… a good file over it.
- A value the app doesn't accept is skipped on its own; the rest of the file still applies.
- A file written by a newer Legend Git loads what this version knows and is never written; Settings says so.
- To start over, delete `settings.json` (or restore `settings.json.bak`).

The full key list is in [reference.md](reference.md).
