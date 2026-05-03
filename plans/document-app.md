# Document-Backed Markdown App Plan

## Goal

Move the markdown app toward native macOS document-window behavior while keeping the React Native runtime constraints intact.

The visible editor windows should be AppKit document windows, with native titlebar document affordances such as the filename control, document menu, and file identity. The existing root app window should not remain visible once a document is open.

## Current Shape

The markdown app currently runs as a React app in the shared shell main window.

- The active filename is React state.
- The editor renders inside the main shell window.
- Window title and represented file metadata are pushed into `NSWindow` through `window-manager`.
- The root React app owns app menus, open/recent actions, dirty state, and the document editor.

This can set a title and represented URL, but it does not fully make the window an AppKit document window.

## Target Shape

Use a hidden coordinator root plus native document windows.

```text
Coordinator main window:
- exists to bootstrap and keep the React Native JS runtime alive
- owns global app menus and open/recent actions
- tracks visible document windows
- is hidden once at least one document window is open
- does not render a document editor

Document windows:
- visible user-facing editor windows
- owned by AppKit NSDocument / NSWindowController
- one React root per document window
- receive documentId and filename as initial props
- report dirty/save state back to native
```

The coordinator window should be ordered out or hidden, not destroyed, so the JS runtime and global menu bridge stay alive.

## Native Package

Create a new macOS native package rather than expanding `window-manager`.

Candidate name:

```text
@legend-desktop/document-windows
```

Responsibilities:

- Create/open document windows for file URLs.
- Own the AppKit document lifecycle.
- Bridge document IDs, file URLs, dirty state, save requests, and close decisions.
- Mount React roots inside document windows.

Keep `window-manager` focused on generic window operations.

## AppKit Model

Add native classes along these lines:

```text
LegendDocumentController / NSDocumentController integration
LegendDocument : NSDocument
LegendDocumentWindowController : NSWindowController
```

The document object should own:

- `fileURL`
- document ID
- edited state
- save/close lifecycle
- represented file identity for the titlebar

The window controller should own:

- document `NSWindow`
- React root view for the document editor
- initial props passed to React

## React Surfaces

Split the markdown app into two surfaces.

```text
MarkdownApp
- coordinator root
- app startup
- global menu registration
- File > Open and recent-document commands
- opens document windows through native package
- hides coordinator window when documents are open

MarkdownDocumentWindow
- one file
- one editor
- receives documentId and filename
- renders MarkdownDocument
- reports dirty state to native
- responds to native save requests
```

Document roots should not register global menus independently.

## Lifecycle

Startup:

1. Shell launches and mounts the coordinator root in the main window.
2. Coordinator registers global menus.
3. If launch arguments include a markdown file, coordinator opens a document window.
4. Once a document window opens, coordinator hides the main window.

Open file:

1. User chooses File > Open or AppKit receives an open-document event.
2. Coordinator/native package opens an AppKit document for the file URL.
3. Native creates a document window and mounts `MarkdownDocumentWindow`.
4. React editor receives `{ documentId, filename }`.
5. Native document window owns the visible titlebar.

Editing:

1. React editor detects dirty state.
2. React reports dirty state to native.
3. Native updates the `NSDocument` change count.
4. AppKit owns edited-window behavior and close prompts.

Save:

Initial implementation can keep file IO in React.

1. AppKit/native document receives a save request.
2. Native asks the document React root to save.
3. React uses the existing markdown save path.
4. React reports success/failure.
5. Native marks the document clean on success.

Later, native-owned file IO can be considered if React-owned save lifecycle becomes awkward.

Close:

1. User closes a document window.
2. AppKit checks native document dirty state.
3. If dirty, AppKit presents the native save/cancel/don't-save flow.
4. Native routes save requests to the document React root.
5. When the last document closes, coordinator can either stay hidden with menus alive or show an open/recent screen.

## Multi-Document Model

Use one React root per document window.

Benefits:

- Natural mapping to `NSDocument`.
- Isolated editor, selection, undo, and dirty state per document.
- Simpler window focus and close/save lifecycle.
- Easier side-by-side multi-document editing.

Costs:

- More memory per open document.
- Need careful menu/focused-document routing.
- Avoid duplicate global setup in each document root.

The coordinator root should remain the single global menu owner.

## Performance Expectations

AppKit document/window creation should not be the main performance cost. For a single document, startup/open cost should be dominated by React root mounting and markdown parsing/rendering.

Potential risks:

- Mounting the full app shell per document instead of a lean editor root.
- Duplicating global menu/listener setup per document root.
- Opening many large documents at once.

Mitigation:

- Keep document roots focused on editor UI only.
- Keep global app concerns in the coordinator root.
- Measure multi-document memory after the first implementation.

## Staged Implementation

1. Add `@legend-desktop/document-windows` native package.
2. Create document window shell with `NSDocument` and `NSWindowController`.
3. Mount a `MarkdownDocumentWindow` React root per document.
4. Keep existing React file loading/saving initially.
5. Bridge dirty state from document root to native document.
6. Bridge native save requests back to the document root.
7. Hide the coordinator main window while documents are open.
8. Verify native titlebar document affordances.
9. Add focused-document menu routing.
10. Revisit native-owned file IO only if needed.

## Open Questions

- Should the coordinator window reappear when the last document closes, or should the app stay menu-only?
- Should File > Open be owned entirely by native `NSDocumentController`, or remain initiated from the coordinator React root?
- How should native save requests target the correct document React root?
- Should each document have isolated undo history in React, native, or both?
- What minimum AppKit document features are required for the native titlebar filename popover to appear reliably?
