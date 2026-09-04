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
- Test arrows, Space, Page Up/Down, Home/End, number + Return, B, and Escape from
  both windows. Test the actual clicker too. Typing in the slide-number field
  must not also navigate the deck.
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

- Passed: workspace typecheck, Slides macOS native-link verification, 28 Slides
  tests (including lock policy, display recovery races, React error containment,
  and GPU cleanup), and the ARM macOS release build.
- Passed: release app opens its presenter interface without Metro.
- Blocked: loading a deck in the release app. Its compiler subprocess can stat
  the compiler script, but reading the script with `/bin/cat` times out. The
  same read and deck compilation succeed from the terminal. macOS reports a
  denied filesystem preflight for the app-associated subprocess; the specific
  access restriction still needs to be resolved. No privacy settings were changed.
- Pending: actual talk deck and duration, runtime audience/GPU/error-recovery
  checks, physical projector/clicker tests, and full-duration rehearsal.

Do not treat this checklist or the passing unit tests as a sign-off for a live
presentation. Complete the blocked and pending checks on the presentation machine.
