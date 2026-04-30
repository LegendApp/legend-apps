# Persistence

## Source Of Truth

Markdown source text is the saved file format and canonical persisted data.

In-memory block IDs, render caches, layout measurements, and selection state are session data only.

Use `@legendapp/state` persistence for app/editor metadata, not for the parsed document cache. The open document session should stay in memory/native, while the app persists lightweight JSON state.

## Autosave

Use autosave by default.

- Debounce saves after edits.
- The debounce should not exceed 2 seconds.
- Save immediately for explicit user save commands.
- Explicit save should flush any pending active-editor commit before writing.
- Track dirty state separately from in-flight save state.
- Prevent overlapping saves for the same document; coalesce pending edits into the next save.
- Save failures keep the document dirty and should surface an app-level error state.

## External File Changes

Initial rule:

- Ignore changes caused by our own saves.
- If the file changes externally while the document has no unsaved local edits, reload fresh.
- If the file changes externally while local edits are dirty, prompt the user to discard local session state and reload.

Reloading discards current in-memory IDs and creates a new document session.

## Recent Files

V1 should keep a recent files list.

Recent file data should include:

- file path
- last opened timestamp
- optional display title

Do not require a folder/workspace model for V1.

## Persisted App State

Persist with the same general pattern used in `legend-music`: observable app state backed by JSON persistence.

Good persisted data:

- recent files
- last opened file
- editor preferences
- window/layout preferences
- autosave metadata
- optional per-file UI state such as scroll position or cursor position

Do not persist:

- parsed blocks
- native parser caches
- generated block IDs
- layout measurements
- rendered markdown snapshots
