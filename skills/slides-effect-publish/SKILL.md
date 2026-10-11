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
5. **Record** (on a Mac with Screen Recording permission): `bun run effects:record <slug> --preflight`, then
   `bun run effects:record <slug> --apply`.
   - Set `LEGEND_VIDEO_RECORDING_SKILL` to the installed video-recording skill directory.
     It must contain `scripts/record-macos.swift` and `scripts/verify-video.py`; no personal
     installation location is assumed. `python3` and `ffmpeg` are required. Optionally set
     `LEGEND_RECORD_MACOS` to an already compiled recorder.
   - Optionally set `LEGEND_APP_LOCK` to an app-lock executable. It holds the slides lock
     for the entire capture. The script stores the compiled recorder and local capture
     artifacts in the system temporary directory.
   - It snapshots the validated local packs and passes `LEGEND_SLIDES_EFFECT_PACKS` to
     both development and release builds, so captures cannot use older installed packs.
   - It launches the build with a blank lead-in before the example and confirms its fullscreen
     audience window. It starts example playback after the ScreenCaptureKit recorder is
     ready, trims the lead-in, and advances literal `<Step>` and `<Steps count={n}>` states
     (count includes the initial state; use `--steps` for dynamic counts),
     quits the app it started, and writes an H.264 mp4 plus a PNG poster to
     `legend-docs/docs/public/slides/effects/previews/<slug>/` (content-addressed names).
   - Video and poster are copied only if the motion check passes. Failure publishes nothing
     and reports the local video, poster, and quality report paths. `--apply` rejects example
     or pack hashes that differ from the published catalog; refresh first.
   - Motion checks default to brief intervals after entry or each reveal, allowing finite
     entrance effects to settle. Use repeatable `--motion START:END` intervals in effect
     playback seconds for longer or delayed motion. Recorder startup times out after 30 seconds.
   - Fullscreen audience capture defaults to no crop. `--crop-top` is an explicit override.
     Watch the mp4 at normal speed before trusting it; confirm the slide content and playback.
   - With a dev build, start Metro first (`bun run slides`) or pass `--release` for a current release build.
6. **Re-run refresh**: it keeps a preview only while both the example and pack hashes still match.
7. **Commit** each repo by explicit paths. legend-apps and legend-docs are public, so ask before pushing.
   - Never run deploy/release scripts. The maintainer deploys `production`.

## Blockers to report, not work around

- Recorder says *Screen Recording permission denied*: the host process lacks permission. Plain
  ssh never has it. Run from a Terminal (or a tmux server started in one) that the maintainer has granted
  Screen Recording, or ask the maintainer to grant it. Do not edit TCC or fall back to screenshots.
- Arrow keys don't advance: the host needs Accessibility permission.
- No displays while windows exist: the display is asleep. Use the macos-screen-capture-setup skill.
