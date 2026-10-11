---
name: slides-effect-publish
description: Add a Legend Slides effect to the gallery on legend.so, with one example deck per effect, a catalog entry, and a recorded preview video from the native app. Use when adding, updating, or re-recording a Slides effect for the docs.
---

# Publish a Slides effect

Each gallery effect has **one example deck**: `packages/slides-effects/examples/<slug>/example.mdx`.
The same deck serves as the docs snippet and as the recording script. Keep it
self-contained, with no talk assets, explicit stage geometry, and `<Step>` reveals only where the
effect has states worth showing. Pack runtime code lives in `packages/slides-effects/packs/<pack>/`.

## Flow (legend-apps, then legend-docs)

1. **Scaffold**
   `bun run effects:add <pack>/<slug> --export <Symbol> [--title ...] [--description ...]`
   - If the pack doesn't export the symbol yet, add `--scaffold-export`, implement it, and bump
     the pack's `version` in `pack.json`. Published pack checksums are immutable.
2. **Author** the example and fill in the catalog `description`/`props`. Then run
   `bun run effects:sync` (copies example sources into catalog snippets; `--check` only reports).
3. **Test** with `bun run test:slides`, and open the example in Slides to confirm it renders, steps, and pauses.
   - Packs use the host playback clock and never run a JS animation loop (see `apps/slides/AGENTS.md`).
4. **Publish locally**: in legend-docs `docs/`, run `bun scripts/refresh-slides-effects.ts`, then
   `bun scripts/validate-slides-effects.ts`.
5. **Record** (on the Mac mini): `bun run effects:record <slug> --preflight`, then
   `bun run effects:record <slug> --apply`.
   - It takes the `slides` app-lock itself, launches the build with the example, records the
     slide window with the video-recording skill's ScreenCaptureKit recorder, advances `<Step>`s,
     quits the app it started, and writes a cropped mp4 plus a PNG poster to
     `legend-docs/docs/public/slides/effects/previews/<slug>/` (content-addressed names).
   - The video is published only if the motion check passes; otherwise only the poster is.
   - Watch the mp4 at normal speed before trusting it.
   - With a dev build, start Metro first (`bun run slides`) or pass `--release` for a current release build.
6. **Re-run refresh**: it keeps a preview only while both the example and pack hashes still match.
7. **Commit** each repo by explicit paths. legend-apps and legend-docs are public, so ask before pushing.
   - Never run deploy/release scripts. Jay deploys `production` himself.

## Blockers to report, not work around

- Recorder says *Screen Recording permission denied*: the host process lacks permission. Plain
  ssh never has it. Run from a Terminal (or a tmux server started in one) that Jay has granted
  Screen Recording, or ask Jay to grant it. Do not edit TCC or fall back to screenshots.
- Arrow keys don't advance: the host needs Accessibility permission.
- No displays while windows exist: the display is asleep. Use the macos-screen-capture-setup skill.
