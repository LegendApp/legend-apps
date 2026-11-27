# Markdown plugins (pilot, schema version 1)

Markdown plugins are declarative JSON. The app runs their contributions with its own code; a plugin never executes JavaScript. Opening or viewing a file never installs a plugin or imports a preset. Both happen only from **Settings → General → Plugins**.

The example in [`examples/house-style`](../examples/house-style) flags “log in” and offers “sign in”.

## Plugin manifest

Install with **Install Plugin…**. The app validates the file and copies it into its settings; later edits to the file have no effect until it is installed again. Installing enables the plugin, and the switch beside its name disables it immediately.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `id` | Lowercase dotted ID, such as `com.example.house-style`. |
| `name`, `version` | Shown in Settings. |
| `commands[]` | `{ id, title, icon?, kind }`. `kind` must be `"checkDocument"`. `icon` is an SF Symbol name. |
| `rules[]` | `{ id, title, find, replace, enabled? }`. A rule matches `find` as a whole word, case-sensitively. `enabled` defaults to `true`. |

Command and rule IDs must start with the plugin ID and a dot, and must be unique within the manifest.

**Check Document** reads the open document, including unsaved edits, and offers the first match of an enabled rule. **Apply** replaces that one match as a single undoable edit. If the matched block changed after the check, Apply withdraws the suggestion instead of editing; run the check again.

## Preset

Import with **Import Preset…** after installing the plugins it names. Import changes only the fields present, and rejects unknown command or rule IDs.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `formattingToolbarMode` | Optional: `selection`, `top`, `bottom` or `hidden`. |
| `toolbar.top` | Plugin command IDs appended to the docked (top or bottom) toolbar, in order. Replaces the previous list. |
| `rules` | Overrides keyed by rule ID: `{ enabled?, replace? }`. Replaces the previous overrides. |

## Limits of the pilot

- Only `checkDocument` commands and literal phrase rules exist. A general-purpose command API, and executable plugins, are open questions.
- Plugin commands are placed only on the docked toolbar, after the built-in controls.
- No uninstall, workspace overrides, marketplace or remote installation.
