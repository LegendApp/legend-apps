# AI Chat History Demo Plan

## Status

Implemented and validated as a macOS debug build.

This plan defines a minimal, read-only React Native macOS demo that discovers recent local Codex and Claude sessions, opens one transcript as an immutable snapshot, and renders it through LegendList with native-backed Markdown content.

The app surface is intentionally small. The meaningful engineering work is the native JSONL document: fast discovery, correct provider normalization, compact indexing, bounded memory, and native content lookup by row index.

## Goal

Build a macOS app that:

- discovers the latest 20 Codex and Claude transcripts from their standard home-directory locations
- shows them in the repository's existing AppKit split-view/sidebar shell
- restores the last selected transcript when possible, otherwise selecting the newest transcript
- indexes the selected JSONL file once on a background native thread
- exposes the completed transcript as an immutable, index-addressed document
- renders user messages, assistant messages, and generic paired tool activity through LegendList
- keeps transcript text and JSONL source data out of JavaScript
- uses the existing native enriched-Markdown renderer for visible message content
- remains responsive and bounded in memory for very large history files

## Product Scope

### Included

- macOS only
- current unsandboxed host configuration
- standard Codex and Claude history roots
- latest 20 combined sessions, sorted by recency
- one selected transcript at a time
- immutable snapshot semantics for the selected file
- latest Claude main chain only
- user and assistant Markdown messages
- generic tool call/result rows, paired by call identifier where possible
- collapsed tool rows with a bounded plain-text preview
- placeholders for provider-specific image and attachment blocks
- remote images already present inside ordinary Markdown, using the existing enriched-Markdown behavior
- selectable/copyable Markdown and external link handling
- one transcript-level warning banner for skipped malformed or unsupported relevant records
- focused parser fixtures and reproducible performance validation

### Excluded

- sidebar message counts
- search, filtering, editing, sending, retrying, or continuing chats
- live file watching or append updates
- tail-first or progressive transcript loading
- persistent transcript indexes or sidecar caches
- retaining multiple mapped transcripts
- custom history roots or folder pickers
- App Sandbox security-scoped bookmarks
- branch selection or sidechain UI
- rich provider-specific tool renderers
- full tool-output viewing, copying, saving, or export
- provider-specific embedded/base64 image rendering
- attachment previews
- custom image networking, privacy, caching, or thumbnail infrastructure
- formal provider schema-version negotiation
- iOS, Android, or web support

If implementation reveals that any excluded behavior is required to make an included behavior complete, stop and reassess the scope instead of adding a placeholder or silently broadening the product.

## User Experience

### Startup

1. Launch one normal visible macOS window.
2. Discover recent transcript summaries in the background.
3. Populate the sidebar with title, provider, and recency. Do not compute or display message counts.
4. Restore the last selected provider/session identifier if it still exists.
5. Otherwise select the newest transcript.
6. Show a deterministic loading state while the selected transcript is fully indexed.
7. Mount the transcript list only after the immutable native document is ready.

### Sidebar

Each row contains only:

- title
- provider identity
- relative or formatted update time

Use `SidebarSplitView` for the shell and `Sidebar`/`SidebarItem` for native macOS selection behavior. Twenty rows are small enough to pass as normal sidebar data; no sidebar virtualization or count computation is needed.

### Transcript

The transcript starts at the end using `initialScrollAtEnd`.

Visible row types:

1. User message
2. Assistant message
3. Paired tool activity

User and assistant rows have React-owned bubble chrome and a native-ID-backed `EnrichedMarkdownText` child. Tool rows show a compact title/status and remain collapsed by default. Expansion requests a bounded plain-text preview from the native document; the initial cap should be 16 KiB and should be adjustable after representative measurement.

Provider-specific image or attachment blocks render a small placeholder inside the containing message. Ordinary remote Markdown images remain part of the Markdown string and use the existing renderer behavior.

### Errors

- A missing or unreadable transcript shows a detail-pane error without removing other sidebar entries.
- A malformed or incomplete final JSONL record is skipped.
- Unknown bookkeeping records are ignored.
- Unknown records that appear relevant to visible content increment a warning count.
- Any warning count produces one unobtrusive transcript-level banner; do not add a forensic record list.

## Reuse From The Repository

### App shell

- `packages/appkit-split-view`: native AppKit split view
- `packages/sidebar`: native macOS sidebar selection and rows
- Music-style visible single-window app startup rather than the hidden multi-window Markdown/Diff host

### List

- `@legendapp/list/react-native`
- `LegendListDataSource` for count/index access without materializing a JS ID array
- `initialScrollAtEnd` for initial placement
- `recycleItems` after auditing the complete row tree
- `dataKey` set to the native document identifier

The snapshot never prepends, reorders, or mutates. Do not add MVCP or maintain-at-end behavior unless the scope later includes live updates.

### Markdown

- `react-native-enriched-markdown`
- the existing `nativeMarkdownBlockId` provider pattern used by `packages/markdown-block-editor`

The chat app should import `EnrichedMarkdownText` directly. It should not link `@legend-apps/markdown-block-editor`, because that package registers its own global Markdown provider. The chat-history native package will register the provider used by this app.

### Persistence

- `packages/storage` for one small application-support record containing the last selected provider/session identifier

Do not persist transcript indexes, decoded messages, recent summaries, or native document state.

## Proposed Repository Shape

```text
apps/chat-history/
  app.manifest.ts
  package.json
  src/
    App.tsx
    ChatHistoryWindow.tsx
    components/
      ChatSidebar.tsx
      TranscriptList.tsx
      TranscriptMessageRow.tsx
      TranscriptToolRow.tsx
      TranscriptWarning.tsx
    state/
      chatHistorySelection.ts

packages/chat-history/
  package.json
  RNChatHistory.podspec
  react-native.config.js
  src/
    ChatHistory.nitro.ts
    index.ts
    TranscriptDataSource.ts
  cpp/
    ChatCatalog.cpp
    ChatCatalog.hpp
    ChatDocument.cpp
    ChatDocument.hpp
    ChatJsonlScanner.cpp
    ChatJsonlScanner.hpp
    CodexTranscriptParser.cpp
    CodexTranscriptParser.hpp
    ClaudeTranscriptParser.cpp
    ClaudeTranscriptParser.hpp
    HybridChatHistory.cpp
    HybridChatHistory.hpp
    HybridChatDocument.cpp
    HybridChatDocument.hpp
  ios/
    RNChatHistory.mm
  tests/
    fixtures/
    run-native.sh
```

Names may be adjusted to match generated Nitro conventions, but ownership should remain split between catalog discovery, generic JSONL scanning, provider normalization, and the retained document.

The package must also be registered in `scripts/lib/nativeModules.ts`, linked by the new app manifest, and followed by `bun run chat-history pods macos` before expecting the runtime binary to expose it.

## Native API

The initial public shape should stay narrow:

```ts
export type ChatProvider = "codex" | "claude";

export interface ChatSummary {
  id: string;
  provider: ChatProvider;
  title: string;
  updatedAt: number;
  path: string;
}

export interface ChatRowMetadata {
  index: number;
  kind: "user" | "assistant" | "tool";
  markdownBlockId?: string;
  toolName?: string;
  toolStatus?: "completed" | "failed" | "unknown";
  hasToolPreview: boolean;
  hasImagePlaceholder: boolean;
}

export interface ChatDocumentTiming {
  sourceBytes: number;
  recordCount: number;
  rowCount: number;
  mappedMs: number;
  scannedMs: number;
  normalizedMs: number;
  documentMs: number;
  totalMs: number;
}

export interface ChatDocument extends HybridObject<{ ios: "c++" }> {
  readonly documentId: string;
  readonly rowCount: number;
  readonly warningCount: number;
  getRowMetadata(index: number): ChatRowMetadata;
  getToolPreview(index: number, maximumBytes: number): string;
  getTiming(): ChatDocumentTiming;
  releaseNativeResources(): number;
}

export interface ChatHistory extends HybridObject<{ ios: "c++" }> {
  getRecentChats(limit: number): Promise<ChatSummary[]>;
  openChat(provider: ChatProvider, path: string): Promise<ChatDocument>;
  cancelPendingOpen(): number;
}
```

Do not expose raw JSONL, arrays of message objects, arrays of row IDs, or full transcript strings to JavaScript.

`cancelPendingOpen` represents the app's single selected-document model. Starting another open should cancel or supersede the previous background scan, and JavaScript should also guard promise completion with a selection generation.

## Native Document Design

### Source ownership

On macOS:

1. Normalize and open the selected path read-only.
2. Capture the initial file size and metadata.
3. `mmap` that snapshot with `MAP_PRIVATE` and `PROT_READ`.
4. Retain the mapping and file descriptor for the `ChatDocument` lifetime.
5. Unmap and close explicitly from `releaseNativeResources` or destruction.

The mapped file is the source of truth. Do not copy the complete file into an owned `std::string`.

The document keeps only compact row and content metadata in heap memory. A representative row entry should contain offsets/lengths, provider kind, role, call relationship, and the small block descriptors needed to materialize visible Markdown or tool previews.

### JSONL scanning

The scanner performs one linear pass over mapped bytes:

- identify record boundaries
- tolerate a final incomplete line
- inspect only fields needed for classification and normalization
- skip unneeded string values without retaining them
- store selected string ranges rather than decoded message bodies
- check a cancellation generation periodically

Avoid building a generic JSON DOM for each record. A specialized structural scanner or an on-demand parser is acceptable, but it must safely handle escaped strings, nested content arrays, and malformed lines. Parser choice should be settled by native corpus tests rather than assumption.

### Content materialization

During the scan, retain exact raw ranges for visible text blocks and tool previews. When a native Markdown provider requests `chat:<documentId>:<rowIndex>`:

1. Resolve the document from a thread-safe weak registry.
2. Validate the row index and document lifetime.
3. Decode/unescape only the row's selected text ranges.
4. Join multiple visible text blocks deterministically.
5. Return the native Markdown string to `EnrichedMarkdownText`.

Do not reparse the complete JSON record during every provider request.

The native provider can be called during measurement and view mounting, so access must be thread-safe. Add a small byte-bounded decoded-Markdown cache only if provider-call measurements show repeated decoding is meaningful; never use an unbounded per-row string cache.

### Lifetime

- JavaScript owns the active `ChatDocument` HybridObject.
- The native Markdown registry holds weak references.
- Mounted native Markdown requests temporarily retain the resolved document while producing content.
- Changing selection releases the previous document after the new selection state no longer renders it.
- `releaseNativeResources` must be idempotent.
- Timing and memory diagnostics must remain callable or be captured before release.

No custom Fabric chat-row view is planned. If one is later introduced, it must implement `prepareForRecycle` and clear all owned subviews, delegates, cached props, document references, and asynchronous work.

## Provider Normalization

Normalization produces one immutable vector of display rows. Counts and list indexes derive from this final vector.

### Codex

Canonical visible content should come from `response_item` records rather than duplicated `event_msg` presentation records.

Include:

- `response_item` user messages
- `response_item` assistant messages
- recognized tool/function/custom calls
- matching call outputs/results

Ignore:

- developer and system messages
- reasoning and agent-reasoning records
- token-count and task-status events
- session metadata and turn context
- world state, compaction state, and inter-agent bookkeeping
- duplicated event-message user/assistant presentation

Pair tool calls and outputs by call identifier. When a result is absent, keep one generic tool row with unknown status. Unsupported call kinds should fall back to the same generic tool row rather than gaining provider-specific UI.

### Claude

Read enough compact metadata from every candidate record to retain:

- record UUID
- parent UUID
- sidechain flag
- record type and role
- selected message content block ranges
- tool-use and tool-result identifiers

Resolve the newest non-sidechain leaf and follow parent links to construct the latest main chain. Render only records on that chain.

Include:

- visible user text
- visible assistant text
- tool-use/tool-result pairs
- image/attachment placeholders where they occur in visible messages

Ignore:

- thinking blocks
- file-history snapshots
- permission/mode/title/last-prompt records
- skill/agent/MCP listing deltas and other attachment bookkeeping
- abandoned branches and sidechains

Provider image content, including embedded base64 blocks, remains a placeholder. Do not convert it into a data URL or pass the payload through JavaScript.

### Compatibility policy

Implement separate Codex and Claude classifiers for currently observed record shapes. Keep unknown-type accounting and fixture coverage, but do not introduce a generalized schema-version framework.

Fixture data must be synthetic or aggressively minimized. Do not commit real prompts, outputs, usernames, home paths, repository names, tokens, or image payloads from local history.

## Catalog Discovery

Search only standard locations:

- `~/.codex/sessions/**/*.jsonl`
- `~/.codex/archived_sessions/**/*.jsonl`
- `~/.claude/projects/**/*.jsonl`

Use provider indexes opportunistically for title and updated time:

- Codex `session_index.jsonl`
- Claude project `sessions-index.json`

Index entries can be duplicated or stale. Last valid metadata wins, but the transcript path must exist before it becomes a summary.

Fallback behavior:

- derive recency from file modification time
- derive provider/session ID from the file/session metadata or filename
- use a provider-and-date fallback title rather than opening every transcript to extract the first prompt

Keep a native top-20 selection while enumerating rather than sending all file metadata to JavaScript. Do not read transcript bodies or compute message counts during catalog discovery.

## LegendList Data Source

The document is complete and immutable before the list mounts, so the data source is intentionally simple:

```ts
class TranscriptDataSource implements LegendListDataSource<number> {
  constructor(private readonly document: ChatDocument) {}

  getLength() {
    return this.document.rowCount;
  }

  getItem(index: number) {
    return index;
  }

  getKey(index: number) {
    return `${this.document.documentId}:${index}`;
  }

  getRevision() {
    return 0;
  }

  subscribe() {
    return () => {};
  }
}
```

List usage:

- `dataSource={transcriptDataSource}`
- `dataKey={document.documentId}`
- `initialScrollAtEnd`
- `recycleItems={true}` after row audit
- stable named `renderItem`, `getItemType`, and row components
- `style={{ flex: 1 }}` or an equivalent stable style
- no `extraData` for row expansion or hover state
- no changing React key on the list

Tool expansion state belongs to the mounted row and must reset safely when recycling changes the row index. Use LegendList recycling hooks where needed.

Do not set `estimatedItemSize` from guesswork. Start with the library default, collect representative message measurements, and add an estimate only if it materially improves initial end placement or large jumps.

## React Ownership

### Window component

Owns:

- catalog load state
- summaries
- selected summary ID
- selected document/load generation
- restoration/persistence of the selected provider/session ID
- loading and error state
- release of the previous native document

### Sidebar

Receives only summary rows and selection callbacks. It must not trigger transcript parsing, counts, previews, or provider-specific content work for unselected sessions.

### Transcript list

Receives one document and one stable data source. The list-level props must not depend on tool expansion, hover, link state, or warning-banner interaction.

### Message row

On mount or index change:

- fetch only `ChatRowMetadata`
- render React bubble chrome based on role
- pass `markdownBlockId` to `EnrichedMarkdownText`
- use the existing selectable and link callback props
- render an image/attachment placeholder when metadata requires it

No message body enters JS.

### Tool row

- fetch only metadata on mount
- keep expansion local and recycling-safe
- request the bounded preview only when expanded
- render preview as plain text, not Markdown
- do not request or retain the full output

## Styling

Use Uniwind `className` for static shell, sidebar, bubble, spacing, color, and typography styles. Use stable `StyleSheet` objects for LegendList viewport sizing, hot row layout, hairlines, measured values, and native-view styles where that is clearer.

Keep the visual design deliberately modest. This is a performance and native-document demo, not a new product design system.

## Implementation Stages

### Stage 1: Fixtures and normalization contract

1. Add minimized synthetic Codex and Claude JSONL fixtures.
2. Document expected rows for each fixture.
3. Cover duplicate Codex event/response representations.
4. Cover Codex tool pairing and missing results.
5. Cover Claude parent-chain selection, abandoned branches, and sidechains.
6. Cover tool blocks, image placeholders, unknown content, and a truncated final record.

Exit condition: expected normalized rows are unambiguous before native UI work begins.

### Stage 2: Native package and catalog

1. Scaffold `@legend-apps/chat-history` as a macOS Nitro package.
2. Register it in native module configuration.
3. Implement home expansion and standard-root discovery.
4. Read provider metadata indexes defensively.
5. Return only the latest requested summaries.
6. Add catalog timing and error coverage.

Exit condition: `getRecentChats(20)` returns deterministic summaries without reading transcript bodies.

### Stage 3: Mapped document and provider parsers

1. Implement mapped source lifetime.
2. Implement the cancellation-aware JSONL scanner.
3. Implement Codex normalization against fixtures.
4. Implement Claude chain resolution and normalization against fixtures.
5. Store compact row/content ranges.
6. Expose row metadata, tool previews, warnings, timing, and release.
7. Add native memory diagnostics for mapped bytes, row metadata bytes, decoded cache bytes, and resident process measurements used by the benchmark harness.

Exit condition: native tests prove row order, row kinds, pairing, warning behavior, cancellation, and cleanup.

### Stage 4: Native Markdown provider

1. Register a chat-specific native Markdown provider.
2. Resolve IDs through a thread-safe weak document registry.
3. Decode only selected visible text ranges.
4. Verify provider calls from native measurement and mounted rendering.
5. Verify document replacement cannot return content from the previous transcript.
6. Confirm the app does not link the competing markdown-block-editor provider.

Exit condition: a native Markdown element renders mapped transcript content without a Markdown string crossing JS.

### Stage 5: App shell and list

1. Add the visible single-window macOS app and manifest.
2. Link only required native modules.
3. Build the split view and native sidebar.
4. Restore selection and fallback to newest.
5. Add loading, empty, error, and warning states.
6. Add the immutable `LegendListDataSource`.
7. Add message rows, generic tool rows, bounded previews, and placeholders.
8. Wire selection, copying, and external link opening through existing Markdown props.

Exit condition: both providers render representative transcripts with no transcript bodies stored in JS.

### Stage 6: Performance validation and tightening

Measure the same interactions on:

- small transcript
- typical transcript
- large transcript around 75 MB
- extreme transcript around 300 MB or the largest safe local sample

Capture:

- catalog duration and files considered
- map duration
- JSONL scan duration
- normalization duration
- click-to-document-ready
- click-to-first-visible-content
- JS heap delta
- native document metadata/cache bytes
- process RSS before open, after open, after fast scroll, and after release
- bytes of transcript content transferred to JS
- fast-scroll blanking and row mount behavior
- repeated selection cleanup

Use native timing fields and focused development logging. Do not create a general benchmark framework unless the focused harness cannot provide reproducible evidence.

Only after measurement consider:

- decoded-Markdown LRU caching
- parser replacement or specialized structural scanning
- a measured `estimatedItemSize`
- persistent indexes
- progressive loading

The latter two remain out of scope unless the full-scan design fails the measured product target and the user approves the architectural expansion.

## Validation Commands

Baseline validation during implementation:

```sh
bun run typecheck
bun run chat-history verify macos
```

After adding or changing the native package or manifest:

```sh
bun run chat-history pods macos
```

Add focused package scripts for:

```sh
bun run test:chat-history
bun run test:chat-history:native
```

Do not run a release build by default. A debug macOS build/run is appropriate only when verifying native linking, actual Markdown rendering, list behavior, or performance. Runtime UI automation and profiling should be used only when explicitly requested.

## Completion Criteria

The demo is complete when:

- the sidebar shows at most 20 existing recent Codex/Claude sessions with no message counts
- restoring and changing selection reliably opens the correct snapshot
- Codex and Claude fixtures normalize to the agreed rows
- the latest Claude main chain excludes abandoned branches and sidechains
- duplicated Codex presentation records do not duplicate messages
- tool calls/results render as generic paired rows with bounded previews
- provider image blocks render placeholders
- visible Markdown is resolved natively by document ID/index rather than passed from JS
- LegendList receives an immutable index-addressed data source with stable keys
- switching transcripts releases the previous mapping and decoded state
- malformed or unsupported relevant records produce a warning without crashing
- representative large transcripts meet measured responsiveness and memory expectations
- typecheck, macOS verification, parser tests, native tests, and focused runtime checks pass

## Primary Risks

1. **Provider semantics, not byte scanning.** Correctly choosing canonical Codex records and Claude's main chain is the highest correctness risk.
2. **Native provider lifetime.** Markdown measurement and view rendering must never access an unmapped or replaced document.
3. **Large string fields.** The scanner must skip irrelevant tool/image payloads without allocating or decoding them.
4. **Cancellation.** Rapid selection changes must not leave multiple huge native scans consuming CPU or returning stale documents.
5. **Memory accounting.** A mapped file is reclaimable, but row metadata, decoded strings, Markdown native state, and process RSS still require separate measurement.
6. **Global Markdown provider ownership.** The app must have one deliberate provider registration path.

These risks are bounded by the fixture-first parser contract, immutable snapshot model, selected-document-only lifetime, and focused performance evidence. They do not require adding product features.
