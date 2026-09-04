# Presentation rehearsal

Use the actual talk deck, presentation machine, display adapter, and clicker.
Record the deck path, tested commit, talk duration, and display resolution before
starting. A successful build is not a successful rehearsal.

## Before the talk

- Build and open the [presentation build](README.md#presentation-build-no-metro).
  Confirm the deck loads without Metro. Resolve file-access prompts in advance.
- Visit every slide. Check text clipping, syntax colors, images, local components,
  HTML, React DOM, Skia effects, and TypeGPU scenes. Verify the audience has the
  intended aspect ratio and black letterboxing.
- Check current/next previews and each slide's notes. Notes must never appear in
  the audience window.
- Test arrows, Space, Page Up/Down, Home/End, number + Return, ⌘B, and Escape from
  both windows. Confirm bare B has no effect, and test the actual clicker too.
- Open the audience window and confirm the deck locks. On a disposable copy,
  save a visible edit: the stage must stay unchanged until **Apply Update Now**.
  Try a syntax error: the last good deck must remain visible.
- On a disposable copy, make a local component throw. The presenter controls
  must survive; the audience must not see the exception details. Navigate away
  and back, fix the component, apply the update, and retry the content.
- Revisit every animated slide several times. Previews should stay static and
  audience animations should restart. Leave GPU-heavy slides running long
  enough to observe failures or sustained fan/heat problems.
- Unplug the presentation display: audience output must close, with a warning
  in the presenter. Reconnect, select it, and press **Present** to resume at the
  same slide. Change resolution/position and check the window fits again.
- Test blackout/restore, Stop, audience close/reopen, and restarting the app.
  Verify the display stays awake while presenting.
- Run the complete talk for its expected duration. Do not install dependencies,
  edit the app, or rebuild between the successful rehearsal and the talk.

## Local verification — 2026-09-04

- Passed: workspace typecheck, Slides macOS native-link verification, 30 Slides
  tests (including lock policy, display recovery races, React error containment,
  and GPU cleanup), and the ARM macOS release build.
- Passed on the local ARM release build: `examples/showcase.mdx` loads without
  Metro after Documents access is granted. Rehearse opens the audience window,
  starts the timer, and locks deck updates. Presenter notes remain separate
  from audience content.
- Visited all 12 showcase slides. Markdown syntax colors, local components,
  lifecycle animation, Skia, TypeGPU clouds and Boids, local HTML, bundled React
  DOM, and expression-generated content rendered. The counter increments.
  Audience Right, Space, Page Down, End, number + Return, and B blackout/restore
  worked. No clipping was observed at the default rehearsal window size.
- Found a blank liquid-effect capture. The pending fix waits for a measured,
  visible, settled stage and recaptures when its scale changes. Its regression
  test passes; visual verification of the rebuilt app is still pending.
- Found and fixed deck-local async syntax failing in Hermes. A local async
  component now loads and completes its native snapshot operation in the
  release app; the compiler regression test passes.
- File-access caveat: older local release builds were ad-hoc signed, so each
  rebuild invalidated macOS Documents approval. Slides now uses the repository's
  Apple Development team for a stable designated requirement. Approve access
  once when switching to the certificate-signed build.
- Passed on the certificate-signed release shell: the presenter has a compact
  native-title-bar layout, File → Open works, and Presentation → Blackout
  Audience is disabled while no audience window is open. The menu command uses
  ⌘B; the bare-B listener has been removed.
- Pending after the one-time Documents approval: effect-fix visual verification,
  the simplified active rehearsal/presentation controls, animation re-entry and
  sustained GPU run, runtime update-lock/error-recovery tests, physical
  projector/clicker tests, and a full-duration rehearsal. The user's test deck
  is the showcase; talk duration has not been specified. The only available
  display was a virtual main display.

Do not treat this checklist or the passing unit tests as a sign-off for a live
presentation. Complete the blocked and pending checks on the presentation machine.
