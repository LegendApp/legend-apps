# Editing V1

## Goal

Ship a WYSIWYG block editor backed by markdown with a small, reliable editing surface before expanding into full rich-document behavior.

## Active Block Model

- Only one block is actively edited at a time.
- Inactive blocks render as markdown.
- Activating a block swaps that block into the editing component.
- Leaving the block commits its markdown back through the document edit pipeline.
- The enriched markdown input owns inline parsing/editing for the active block and emits markdown change callbacks.
- Rely on the current `react-native-enriched-markdown` input API first. If a truly missing callback or command blocks the editor, work around it locally or contribute it upstream.

## Initial Block Types

Prioritize:

- paragraphs
- headings
- fenced code blocks
- basic list items
- blockquotes when simple

Tables and complex markdown structures can render normally and fall back to raw block text editing until the native editing component supports richer behavior.

## Selection

- Cursor/selection inside the active block is handled by the active editor.
- Multi-select selects whole blocks, not arbitrary ranges spanning partial blocks.
- Typing while whole blocks are selected removes the selected blocks and replaces them with the input.
- Deleting a multi-block selection retires those block IDs for the current session.

## Block Editing Rules

- Inline formatting happens in the active editor.
- Formatting commands should call the active editor when supported and fall back to markdown source transforms when needed.
- Enter in a paragraph/list-like block splits the block when possible.
- Backspace at the start of a block merges with the previous compatible block when possible.
- Splits preserve the original block ID on the first/left block and allocate IDs for new blocks.
- Merges preserve the earlier block ID and retire merged-away IDs.
- Paste creates new blocks and allocates new IDs.

## Undo/Redo

JS owns the initial undo/redo stack.

Undo entries should store:

- the edit transaction
- cursor/selection restoration data
- retired/restored block ID metadata for the current session

Native `applyEdit` should return enough patch/inverse metadata for JS to build reliable undo entries.
