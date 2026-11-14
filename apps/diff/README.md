# Legend Diff

Legend Diff is a macOS diff viewer built around native parsing and virtualized rendering. It can inspect local repository changes, compare refs or files, open patch files, load GitHub pull requests and commits, and help resolve working-tree merge conflicts.

## Current scope

- open a Git folder and compare the working tree or another local/remote ref
- compare unstaged or staged changes, a local commit against its first parent, or a two-dot/three-dot range
- compare two individual files
- open `.diff` and `.patch` files
- open GitHub pull-request and commit URLs
- accept folders, files, and URLs through dialogs, drag and drop, paste, launch arguments, and the `legend-diff://` URL scheme
- keep filtered recent sources for folders, files, pull requests, and commits
- browse changed files in a sidebar and render unified or block-oriented diff views
- search the whole diff with keyboard navigation and active-match centering
- toggle syntax highlighting, full-file context, statistics, font settings, and window restoration
- detect merge-conflict files, choose ours/theirs/both per conflict, preserve drafts, and save resolved files
- install an `ldiff` shell command from Settings for opening Git diff arguments in the installed app
- update release builds through the shared Sparkle updater
- customize the viewer and start screen with prompts, reversible previews, and saved change stacks

Legend Diff currently supports macOS only. Local repository comparisons require Git, and GitHub URL loading requires network access to the public `.diff` endpoint.

## Customize App

Settings → Customize App uses an installed, signed-in Codex or Claude CLI to turn a prompt into changes to the viewer and start screen. Generation produces a separate preview window with a sample diff. Keep activates the exact compiled preview; Revert leaves the current app unchanged. The optional automatic keep setting activates a preview after it renders successfully.

Each kept version records the prompts, ordered edits, and compiled code. Add prompts to stack changes, or edit, disable, and delete an earlier change. Later edits replay against the revised stack; a dependency conflict stops the preview and leaves the current version intact. Saved versions can be previewed and restored without calling AI again. Restore Original App clears the active stack while retaining saved versions.

Settings and the Keep/Revert controls remain outside customized code. Activation checks unsaved merge drafts, and render failures return to the original viewer. Preview file operations use the sample diff and block host mutation APIs, but generated JavaScript is trusted customization code rather than a security sandbox. Customizations use existing JavaScript and native capabilities; adding a native module requires a normal app build. Versions from an incompatible source baseline remain in history but cannot be activated.

Development uses `scripts/diff-customization.mjs`; macOS packaging embeds the baseline and compiler in a signed helper. When adding imports to editable source files, regenerate the shared host map:

```sh
bun scripts/diff-customization.mjs --hosts
bun test scripts/diff-customization.test.mjs
```

## Run

From the repository root:

```sh
bun run diff start macos
bun run diff run macos
```

Open an existing development build without rebuilding:

```sh
bun run diff open macos
```

The Diff Metro server uses port `19095` by default.

## Git comparisons

From a repository, `ldiff --index-vs-workdir` opens unstaged changes and `ldiff --head-vs-index` opens staged changes. Use `ldiff --commit <sha>` for a commit (root commits compare against the empty tree), or `ldiff main..topic` / `ldiff main...topic` for a direct / merge-base range. Other Git diff arguments keep their existing behavior.

The same arguments work in `legend-diff://open?cwd=<encoded-path>&arg=<encoded-argument>` (repeat `arg` for each argument), or as app launch arguments with `--cwd <repo>`. Comparison sources retain their repository and target when windows are restored.

## AI skills

Open **Story** to generate a guided review with your signed-in Codex or Claude CLI. Use the skill picker for the compact `change-story` or the longer `change-story-detailed` walkthrough. **Edit skill…** opens **Settings → AI Skills**. Built-ins are read-only; **Duplicate to edit** creates a user override, and **Restore built-in** removes that override.

Skills are Markdown files with flat YAML scalar fields followed by the prompt body:

```markdown
---
name: change-story
kind: story
output: story
organization: auto
tool: auto
maxDiffTokens: 120000
timeout: 300
---
Explain the problem and resulting behavior. Reference the supplied hunks.
```

`kind` is `story` or `workflow`; stories output `story`, while workflows output `check`, `comments`, or `patch`. `organization` is `auto`, `concepts`, or `commits`; `tool` is `auto`, `codex`, or `claude`. `maxDiffTokens` is a positive integer. `timeout` is in seconds and defaults to 300; organization defaults to `auto`. Unknown fields, duplicate fields, invalid values, and empty prompts show validation errors. The fixed output contract and coverage accounting remain outside the editable prompt.

Files with the same `name` override lower layers, in this order:

1. `<repository>/.legend-diff/skills/*.md`
2. `~/Library/Application Support/Legend Diff/skills/*.md`
3. Bundled built-ins

The list shows all layers and marks the active copy. Repository and user edits reload through the file watcher. Repository prompts require approval for the repository and exact file hash; changed files need approval again. Provider consent is separate and names the CLI account used to send the selected diff content.

**Try on current diff** uses the editor draft in a preview in the current viewer. Closing the preview returns to the saved story; trying does not save the prompt or replace the cached story. Workflow prompts can be stored and edited here; workflow execution is added separately.

## Validate

The fast validation command covers the Diff app, both parser packages, native diff-parser tests, package linking, and TypeScript:

```sh
bun run test:diff:fast
```

Individual checks are also available:

```sh
bun run test:diff --runInBand
bun run test:diff:git
bun run test:diff-parser --runInBand
bun run test:syntax-parser --runInBand
bun run test:diff-parser:native
bun run diff verify macos
bun run typecheck
```

The Git integration target creates and removes temporary repositories, including conflict, rebase, detached HEAD, worktree and stash fixtures. Submodules, LFS and large histories are deferred.

The runtime E2E harness is separate:

```sh
bun run test:diff-e2e
```

## Release

Diff has convenience aliases for macOS packaging and GitHub release publication:

```sh
bun run diff:package:arm
bun run diff:package:x86
bun run diff:package:all
bun run diff:release:github
```

Release notes come from `CHANGELOG.md`. Packaging is credentialed release work and is not needed for ordinary development.

## Key files

- `app.manifest.ts` declares macOS identity, URL handling, native modules, and Sparkle metadata.
- `src/App.tsx` owns startup, menus, recents, source opening, and viewer-window orchestration.
- `src/start-screen/` contains the launcher and recent-source experience.
- `src/DiffViewerWindow.tsx` is the main loaded-document, search, merge, and rendering surface.
- `src/viewer/` contains loaded-document models, rows, search, and controller helpers.
- `src/diffFiles.ts`, `src/diffCompareTargets.ts`, and `src/diffMerge.ts` define the supported source and merge workflows.
- `src/customization/` owns prompt generation, strict stack replay, compiled snapshots, preview recovery, and settings.
