---
name: legend-slides
description: Create, edit, and validate Markdown or MDX presentations for the Legend Slides native app, including layouts, reveals, shared elements, effects, and local React Native components. Use for Legend Slides decks, not PowerPoint or Google Slides.
---

# Legend Slides

Deliver a `.mdx` deck and its local assets/components. Legend Slides is a React
Native macOS application, not a browser-based slide renderer. Prefer Markdown
and layout directives; use local TSX for behavior those primitives cannot express.

## Authoring workflow

1. Locate the user's deck and, when available, the `LegendApp/legend-apps`
   checkout. Existing templates and local packs often supply the intended style.
   Keep imported files below the deck's directory; copying a demo into another
   folder also requires copying its local dependencies.
2. Read [authoring.md](references/authoring.md) for frontmatter, supported Markdown,
   layouts, steps, notes, shared elements, and focus. Start a new deck from
   [starter.mdx](assets/starter.mdx) when useful; preserve the user's content and
   requested structure rather than imposing the starter's slide count.
3. Read [components.md](references/components.md) when using custom components,
   templates, shaders, GPU scenes, Webviews, or effect packs. Host components are
   available by name in MDX, but local TSX must import its own dependencies.
   `Scene` and named effect-pack demos are deck-local helpers, not host APIs.
4. Validate with [validation.md](references/validation.md). If the checkout and
   Bun are available, run the bundled `scripts/validate-deck.ts` against the real
   compiler. Fix errors and review warnings. Compilation is not visual testing:
   inspect the native app for layout, transition, capture, and GPU behavior when
   runtime tooling is available. Report what was and was not verified.

Use logical slide units, explicit media dimensions, and short readable content.
Step 0 is the initial state; speaker-note labels and the presenter's counter are
one-based. Shared IDs must match across slides and be unique within a slide.
Use literal Uniwind classes, not dynamically constructed class names. Ordinary
HTML/CSS belongs in a `Webview`, not the native slide tree.

For custom animation, use the shared presentation clock, keep previews static,
pause inactive/preparing slides, and clean up timers and native resources. For
Legend State, retain the caller-owned observable, subscribe in the smallest
consumer, and avoid mirroring React props into observables during render.

A missing checkout does not prevent writing a deck. Deliver the files and state
that compiler/native validation was unavailable; do not claim that installing
this skill installs the Slides application. Do not build or publish a release
unless the user requests it.
