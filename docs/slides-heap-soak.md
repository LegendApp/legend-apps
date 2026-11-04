# Slides Hermes heap soak — 2026-11-04

Current engine at `494ccc6a`: 24 full forward/back passes, 384 asserted slide/step moves, **0 crashes and 0 runtime errors** in 15.6 minutes. The six-slide, nine-step deck ran with both presenter and audience windows mounted and unminimized. Each action waited 1.8 or 3.5 seconds; eight passes used the longer wait so delayed presenter work could run.

The Release app and renderer were unchanged. A job-local entrypoint opened an immutable compiled result, called the normal navigation commands, checked every destination, and wrote scalar counters for both Hermes runtimes. It retained no console objects, scene dumps, readback frames, or frame history. No forced GC or heap-limit increase was used.

| MiB | Main JS | UI worklets |
| --- | ---: | ---: |
| Initial allocated | 72.7 | 95.4 |
| Allocated range during soak | 34.7–171.4 | 53.6–256.1 |
| Final allocated | 124.7 | 160.1 |
| Heap size, initial → final | 112 → 180 | 100 → 264 |
| Largest heap size | 180 | 268 |
| External bytes, initial → final | 138.4 → 40.3 | 85.7 → 20.5 |

Allocated bytes include garbage awaiting collection. Natural collections reduced main allocation from about 171 MiB to 35 MiB and UI allocation from about 256 MiB to 54 MiB. Heap size grew between collections; these measurements do not show monotonically retained JS data. Both runtime configurations use the normal 3 GiB maximum. The historical failures have no recorded heap counters, so a measured before/after fix comparison is unavailable.

Verdict: **a deck/engine Hermes leak was not reproduced; the capture harness is the leading explanation, with causality still unproven.** Both historical crash reports identify the main JS thread. The old capture code frees its ten mapping slots before awaiting each 3,911,680-byte frame write, leaving copied frames and pending writes unbounded when I/O falls behind. A job-local proposed diff moves slot release after write completion. No speculative engine change was made.

A 15-second Instruments Allocations trace completed. Its command-line export exposes no allocation rows, so no retained native type is attributed from it. Native RSS rose during the instrumented run; an unprofiled control is still needed to distinguish profiler overhead from native growth. This evidence does not certify native memory stability.

FPS verification remains incomplete: the additional cadence trace waited below the shared 20 GB disk admission level and was cancelled before the app quit. No ~60 fps claim is made from navigation timing. A bounded submit-counter run is prepared in the job; it needs disk admission. No cache was deleted.

Evidence: `~/devroot/scratch/jobs/slides-oom-20261104/` contains `heap.csv`, `heap-summary.json`, `done.json`, window metadata, scalar samples, the immutable compiled input, driver sources, a proposed capture backpressure diff, and the trace. The obsolete Debug attempt had a Worklets version mismatch and is excluded. Trace files can contain launch environment metadata and should remain local.
