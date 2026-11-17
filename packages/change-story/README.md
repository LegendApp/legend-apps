# @legend-apps/change-story

The host-neutral Change Story core shared by Legend Diff (the app and `ldiff story`) and Review.

- `storyHunks`: builds a `StoryInput` (hunks, IDs, canonical diff text, `diffHash`) from any document shaped like diff-parser's `DiffDocument`.
- `storySkill`: parses and serializes skill Markdown and assembles the prompt from a skill, the host's fixed output contract and the input.
- `storyRunner`: `createOutputRunner` runs a skill through the Codex or Claude CLI with injected process dependencies, validates the output with the host's contract and allows one repair.
- `storyContract`: the schema checker, hunk reference checks and result JSON extraction that output contracts build on.
- `storyHash`: SHA-256 without Node crypto or a native module.

Every module imports only the others, never React, Spark, Nitro or another package, so Review's headless CLI loads them through Node's type stripping. Keep the TypeScript erasable: no parameter properties or enums.

Each host keeps what differs: its output contract (Diff returns JSON, Review returns Markdown), its built-in skill texts, how it quotes diff paths (`wrapStoryPath` for Diff, `quoteStoryPath` for Review) and its cache or bundle store. Skill text, path quoting and the canonical diff text feed the hashes hosts cache by, so a change to any of them invalidates existing stories; Diff's `storyIdentity` test pins them.
