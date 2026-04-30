# Navigation And Search

## Goal

Use parser metadata to make large markdown documents easy to navigate without making navigation part of the core editing model.

## Outline

Build a heading outline from parsed block metadata after load.

The outline should support:

- heading text
- heading level
- block ID
- current index lookup through `indexById`
- jump to block

## Search

Start with single-document search.

Search can be built from canonical source text or hydrated block text, but results should resolve back to block IDs for scrolling and selection.

## Timing

Navigation indexes can be built after first paint and updated after edit patches.

They should not block initial document render.

## Deferred

- backlinks
- project-wide search
- folder/workspace symbols
- multi-document tabs

