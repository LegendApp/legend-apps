# Product Scope

## Direction

Build a single-document markdown editor that feels WYSIWYG. The user edits the rendered document directly; there is no separate edit mode, preview pane, or source/preview toggle in the primary workflow.

Markdown source remains the storage format and source of truth, but the product experience is a block editor backed by markdown.

## V1 Product Shape

- Single open document.
- Recent files list.
- Direct block editing in the document surface.
- Native markdown rendering for non-active blocks.
- Active block uses the best available rich/text editing component for that block type.
- Folder/workspace mode is deferred.

## Non-Goals For V1

- Full multi-document workspace.
- Persistent block IDs embedded in markdown.
- Separate markdown source editor as the main UI.
- Full rich editing coverage for every markdown construct.
- Complex collaborative/external merge behavior.

## Rendering And Editing Principle

If rich editing is supported for a block type, use it. If not, fall back to text editing for that block while preserving rendered display outside the active edit state.

The app can contribute improvements upstream to `react-native-enriched-markdown` over time for richer editing of more block types.

