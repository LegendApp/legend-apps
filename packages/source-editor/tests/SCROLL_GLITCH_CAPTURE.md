# Rare full-viewport blank: source-scroll-v1

Status: **Incomplete**. The 800-pass deterministic range/recycling test passed
on the previously vendored Legend List version; it does not execute Fabric/AppKit
or reproduce the user's rare half-second blank. During capture preparation the
working tree's vendor was separately updated from 3.3.5 to 3.3.10. Reproduction
must identify the tested version; evidence from the older vendor is not validation
of the new one. Six existing row-index tests fail against that concurrent update;
this probe does not modify the vendor or those tests.
No rendering fix or draw-distance adjustment is part of this probe.

## Contract before reproduction

Trigger: rapid up/down scrolling (including scrollbar changes) in an already
loaded large file. Exact symptom: all content **and line numbers** disappear
briefly, then return. Do not substitute delayed syntax colors or opening a file.

Questions and initial qualitative confidence (not measured probabilities):

1. JS delivery/commit delay or exhausted render buffer, 45%: native scroll
   arrives before matching JS scroll/range, JS row commits, and native row props.
   A JS heartbeat gap would support JS starvation; timely heartbeats with late
   commits instead point toward scheduling/mounting. Both can contribute.
2. Main-thread layout/paint stall, 40%: JS commits are timely, but main heartbeats
   or row layout/draw durations spike. A native callback timestamp records when
   it ran, not necessarily when the compositor moved the scroll surface.
3. Recycled identity/layout invalidity, 15%: both threads remain responsive but
   visible coverage falls or row-draw-skipped/stale-id events appear after props.

These probes may identify a boundary, not its internal CPU stack. A later scoped
Time Profiler recording may be necessary. A complete capture can falsify these
candidates; absent events in an incomplete capture cannot.

Native events use epoch milliseconds plus monotonic milliseconds, session UUID,
sequence, event, and owner (native editor instance). JS batch events retain the
original JS epoch timestamps and sequence numbers, rather than native receipt
time. Correlate JS lineId/line with native-row-props, row-layout, and row-draw;
native-scroll includes viewport y/size, valid/stale row counts and vertical
coverage. Native owner and window IDs separate multiple windows. host-ready
links the JS batch owner to that native instance. session includes PID, OS and
compiled probe date; capture.json identifies the executable by SHA256 and path.
Record the tested document and build configuration in the report, not hot logs.

native-scroll observes existing clip-view bounds notifications; it does not
change notification behavior or force layout. Covered height is mounted geometry,
**not proof pixels reached the display**. Draw callbacks are also not compositor
presentation timestamps. A user marker (and ideally a screen recording) is needed
to identify the actual visible failure, rather than labeling every coverage dip
as the bug. user-mark records both handling time and the original key event's
monotonic timestamp. Mark immediately after the blank, even if it has recovered.

## Prepare on the machine where it occurs

1. Apply the probe changes on that machine. They are temporary/uncommitted, so
   checking out the same branch alone will not transfer them.
2. Save work and quit Code normally. Refresh native sources:
   `bun run code pods macos`.
3. Rebuild using your usual configuration. For your built release app:
   `bun run code build macos`. No packaging is needed. Keep the local signing
   setup so downloaded grammars work. For a dev binary, use the normal dev build
   and keep the matching Metro running, then quit the app before the next step.
4. Run with the **exact rebuilt app path**, for example:

   ```sh
   bun scripts/capture-code-scroll.ts "$PWD/shell/.legend/workspaces/release/code/macos/build/xcodebuild-release-arm/Build/Products/Release/Legend Code.app"
   ```

The launcher refuses to close an existing Code process. It prints a private
temporary capture directory and launches that exact binary with an opt-in flag.
It does not sign, rebuild, package, or modify documents. An old binary will not
produce native trace files; missing JS batches indicate stale JS or failed setup.

## Reproduce and return evidence

Open the affected file, wait for loading/highlighting to settle, and scroll as
you normally do. Capture up to five minutes. As soon as the **whole viewport**
blanks, press **Command-Option-Shift-D** in Code. Repeat for further occurrences.
After the last marker, wait at least two seconds, then quit Code normally.
The shortcut is reserved only in a capture-enabled process. Outside the capture
window it is not consumed. If no glitch occurs, report that; it is not a pass.

Send the printed folder (`capture.json` and `scroll-*.jsonl`) and reply **done**.
Include approximate marker(s), whether colors had finished loading, the document
size/line count, scroll method and Debug/Release. An optional recording of only
the Code window is useful if comfortable sharing visible source text. The trace
itself excludes document text, filename, keystroke contents and signing identity.
The app's executable path in capture.json can contain the local username.

## Analyze / validation signal

Check session/host-ready/native-scroll/js-batch/row-draw/main-heartbeat presence,
original JS times and sequence continuity, dropped counts, user-mark window and
that the capture did not end before the symptom. Reconstruct the two seconds
before each marker (the mark follows the visible failure), plus one second after.
Compare marked scrolls against unmarked fast reversals in the same run. Large
JS gaps with smooth native callbacks, native gaps with smooth JS delivery, and
stale/empty row geometry with smooth callbacks discriminate the candidates.
Do not treat expected EOF whitespace as missing coverage. If all boundaries are
timely, investigate compositor/Fabric presentation rather than inflating buffers.

Logging buffers at most 20,000 native events per flush and 4,000 JS events per
batch; overflow is counted. JSON/file work runs on a serial background queue;
JS crosses the bridge four times a second. Probes still add CPU/allocations and
can perturb a rare issue. Compare a normal launch if capture changes the symptom.
Tracing expires after five minutes. Relaunch normally to disable it completely.
Keep probes and logs until requested cleanup; do not include temporary probes in
normal feature commits.
