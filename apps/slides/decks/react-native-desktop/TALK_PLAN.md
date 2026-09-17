# React Native is the best way to build desktop apps

Agreed story direction · September 17, 2026

This is the plan for the next revision. `talk.mdx`, its charts, and the existing
`RUNNING_ORDER.md` still describe the earlier draft. The provisional budget is
20 minutes, following that draft; confirm the actual slot before scripting.

## Thesis

> I compared nine desktop implementations of a real chat-history app, plus
> Hello World baselines. Based on those results, React Native offers the best
> combination of speed, memory efficiency, and native UI among the
> cross-platform approaches I tested.

Keep the bold title. Make the case through the evidence that convinced Jay,
rather than claiming an objectively universal winner. The measurements are
objective; choosing the best combination is an engineering judgment. The
comparison covers these implementations and workloads on macOS, not measured
performance across every supported platform.

Performance, memory, and real native UI establish the technical case first.
React familiarity and React Native everywhere are additional advantages, not
reasons to accept a weaker desktop experience.

## Story and timing

| Time | Story point | Evidence or demonstration |
| --- | --- | --- |
| 0–2 min | Desktop apps can feel like this. | Short Music, Code, and Diff videos: opening quickly, then immediately doing something useful. |
| 2–3 min | So I built the same app nine times. | Introduce Chat History, the competing approaches, Hello World baselines, and concise measurement rules. |
| 3–8 min | Look at the combination: speed, memory, native UI. | First-content, interaction, and memory charts; size as supporting evidence; a synthesis slide connecting results to rendering approach. |
| 8–11 min | React is composing a native application. | Native views, native data ownership, a short React/native interface example, and real desktop behavior from the apps. |
| 11–13 min | And then you get React—and potentially every platform. | Familiar React/TypeScript, fast iteration, shared product logic across mobile, desktop, and web, with platform-appropriate interfaces. |
| 13–17 min | Let's make this easier to build and ship. | Introduce Legend Framework, its desktop capabilities, development workflow, current release scope, and longer-term ambition. |
| 17–20 min | This presentation is another example. Join in. | Reveal Legend Slides, announce its planned open-source 0.0.1 release, show GitHub links, and invite developers and maintainers to participate. |

## The comparison is the centerpiece

Hello World measures baseline overhead; Chat History exercises substantial
application work. Present them as complementary evidence, with separate charts
and clear workload labels. Do not mix a greeting app's size with the chat app's
performance.

Build the argument in four beats:

1. **It's fast.** Show first content and meaningful chat interactions.
2. **It stays light while doing real work.** Show settled memory, including
   attributed helpers. Treat installed size as a separate measurement.
3. **You get real native UI with that.** Explain the difference between native
   content views, web rendering, and framework-drawn UI; a native window border
   alone does not establish native content UI.
4. **The combination is what matters.** Give competitors their wins, then show
   why React Native is the best balance for the stated criteria.

Synthesis slide:

> Fast. Low memory. Native UI.
> You can have all three.

Transition to developer experience:

> That's the technical case. I haven't even counted the fact that it's React yet.

### Current evidence snapshot

Source: `/Users/jay/Documents/code/legendapp/chat-history-comparison/docs/DESKTOP_FRAMEWORK_REPORT.md`
(September 17 report).

| Chat-history measurement | React Native | AppKit | GPUI | Tauri | Electron |
| --- | ---: | ---: | ---: | ---: | ---: |
| First content, ms | 406.3 | 318.9 | 335.5 | 544.0 | 1277.7 |
| Initial memory, MiB | 52.8 | 42.4 | 289.0 | 363.5 | 477.5 |
| Jump, ms | 45.0 | 79.1 | 50.5 | 70.6 | 70.5 |
| Switch, ms | 157.7 | 88.3 | 193.1 | 218.9 | 679.0 |
| Total installed size including grammar pack, MiB | 42.2 | 4.5 | 10.7 | 11.6 | 285.7 |

The final comparison should include all tested approaches; the subset above is
a planning reference, not permission to omit inconvenient results. AppKit wins
first content, initial memory, and switch time. GPUI is faster to first content
than RN but uses more memory and custom rendering. RN has the lowest jump time.
RN does not have the smallest chat app; count its required grammar pack.

Useful phrasing:

> If I only wanted to target macOS, AppKit delivers excellent numbers. React
> Native gets remarkably close—and gives me a cross-platform foundation.

The report currently pairs newer sizes with an earlier controlled timing/memory
run. Rerun current builds before freezing final charts, or explicitly label
the different revisions. Keep measurement conditions and reproduction details
available in notes/backups. GPUI lacks equivalent compositor work for the
composer blur in this comparison; retain that limitation in supporting notes.
Do not repeat the old deck's claims that RN is first to content or uses 102 MB.

## Give each app a distinct role

| App | Role | Suggested clip |
| --- | --- | --- |
| Chat History — launched | Real workload and bridge to the benchmark | Open a large transcript, jump, switch conversations. |
| Code — launched | Demanding desktop text interface | Open a large source file, scroll, navigate; demonstrate editing only as supported by the filmed version. |
| Diff — launched | Complete desktop workflow and integration | Open a repo or PR, navigate changed files, search, or resolve one conflict. |
| Music — previously launched; new version coming | Consumer-app breadth, custom visual design, native OS services | Open, play, change the queue, show media controls or the song overlay. Label unreleased footage appropriately. |
| Markdown — possible pre-talk launch | Native authoring and document behavior | Edit a block, format a selection, save. Optional; the main story must work without its launch. |
| Slides — planned 0.0.1 announcement | Closing proof and open-source reveal | Show presenter UI, source editing, and the separate audience window. Keep it out of the opening montage. |

Videos establish the experience; controlled measurements establish numerical
claims. Keep startup footage at real speed. Use short excerpts throughout the
argument instead of a long standalone product tour.

## Native architecture and React Native everywhere

Explain React coordinating native pieces while large data and expensive work
can remain native. Show one concise example rather than a full internals lesson.
Use actual native UI and desktop interactions; keep at most one memorable glass
or graphics flourish in the main story.

Say “No WebView required” and “No browser-renderer-to-main-process IPC layer to
design around,” rather than an absolute “no WebViews or IPC.” Optional web
integrations and helper processes can exist; Music includes a Spotify WebView
integration. Native calls and thread boundaries still have costs.

React Native everywhere is the broader vision: mobile, desktop, and web with a
shared development model, logic, state, and appropriate components. Adapt layout,
navigation, and platform services deliberately. Music declares mobile targets,
but its full documented experience is macOS-first. Select a verified mobile/web
example before treating this app collection as proof of all three targets.

## Framework and launch payoff

Transition:

> After building these apps, I kept needing the same desktop foundations. I
> want you to start with those foundations already there.

Positioning:

> The goal is much of Electron's desktop feature set, built around React Native.

Group the explanation around development, desktop integration, and shipping:
prebuilt/custom runtimes; windows, menus, files, dialogs, shortcuts, and OS
services; standalone builds and packaging/update capabilities. Separate verified
release functionality from the roadmap. These apps inform the framework; do not
claim they all already consume its final public SDK.

Reveal:

> This is Legend Slides. It's a React Native desktop app. Today I'm releasing
> version 0.0.1, and it's open source.

Use that announcement once the release is actually available. Keep the Slides
and framework links clearly labeled:

- Slides source: https://github.com/LegendApp/legend-apps/tree/main/apps/slides
  (verify the public default branch/path and release destination before making QR codes).
- Framework: https://github.com/LegendApp/legend-framework
  (verify public availability and onboarding before the talk).

Close with two concrete asks: developers, try building a desktop app; library
maintainers, add/test desktop support and document platform coverage so mobile,
desktop, and web can become first-class targets.

Final takeaway:

> React Native isn't just a way to bring a mobile app to desktop. It's a
> compelling way to build a desktop app in the first place.

## Next deck revision

- Confirm talk duration and audience; select the actual app video excerpts.
- Refresh benchmark data and replace stale chart values, captions, and notes.
- Restructure the main deck around this outline, giving the comparison space.
- Move agent-development material and most effect-gallery content to optional
  material; retain only effects that serve this story.
- Choose and verify a cross-platform demonstration.
- Confirm framework launch scope, Slides 0.0.1 availability, and final links.
- Update the running order after the MDX revision and rehearse to the real slot.
