# Chat parser tests and local schema audit

Run the regular native suite from the repository root:

```sh
bun run test:chat-history:native
```

The suite runs deterministic fixture tests, image tests, and then a read-only audit of the 20 most recent catalog entries. The audit automatically skips when no local Codex chats are available and fails the suite on unexpected fallback use.

The deterministic tests use checked-in or generated temporary fixtures. They assert that old Codex envelopes (`timestamp,type,payload`) and newer envelopes (`timestamp,ordinal,type,payload`) stay on the shallow fast path, with identical content. Coverage includes canonical tool/file/image fixtures, mixed formats, large ignored payloads, escaping, unknown/reordered fields, and malformed/truncated records.

The path assertions are intentional performance regressions: a new fallback fails the test even on a fast machine. Wall-clock timing thresholds would hide schema problems or become flaky.

## Running the recent-chat audit separately

```sh
bun run test:chat-history:recent
# Override the recent catalog window (default 20, maximum 1000):
bun run test:chat-history:recent 50
```

Equivalent without Bun:

```sh
bash packages/chat-history/tests/run-native.sh --audit-recent 20
```

This discovers the normal recent-chat catalog on the current machine and parses its Codex entries read-only. It emits session IDs, byte/record counts, fast/fallback counts, bytes sent through the fallback, warning counts and normalization times. It does not print titles, paths, message text or tool output, modify transcripts, or create a cache/index. Existing provider catalog metadata is used by normal discovery.

The audit exits nonzero if any audited Codex record uses the general envelope fallback or a file cannot be parsed. A valid reordered envelope can still render correctly and fail the audit: that is deliberate, because it identifies a potential performance regression. Investigate the new envelope before adding a minimal synthetic fixture and extending the recognized fast path; do not silence failures with a percentage allowance.

Warnings are reported separately and do not fail this performance audit. They can include unsupported record types or incomplete records in a chat still being written. Files can change during the audit, so rerun a suspicious result against a stable transcript. Claude entries are skipped because their parser intentionally uses a different path. If the requested catalog window contains no Codex entries, the command explicitly reports SKIP.

This local-data check runs automatically in the native suite; it is not a hermetic fixture test. It detects Codex envelope fallbacks, not every possible parser/rendering bottleneck. Native counters are collected per parse and discarded with the result; they are not persisted by the app.

## Validation contract

Recognized old and ordinal envelopes use the same shallow metadata policy: fields consumed by the UI are checked, while ignored payload subtrees are not recursively validated. Therefore malformed unused content need not produce a warning. General fallback parsing may detect more malformed data. Tests make this distinction explicit; this parser is not a full JSON validator.

For native timing and parity on a specific stable file:

```sh
bash packages/chat-history/tests/run-native.sh --probe codex /absolute/path/to/transcript.jsonl
```

The probe reports parser stages, path counters, warning/row counts and the canonical display-content digest. Compare identical files and build modes; native time is not whole-app startup time.
