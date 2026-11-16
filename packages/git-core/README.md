# Git core

Shared Git service, porcelain v2 status and for-each-ref parsers, and Git comparison source helpers for Legend Diff and Legend Git. The service owns per-repository serialization, cancellation, index-lock detection, and operation logs. `stageFile` and `unstageFile` accept one repository-relative literal path, serialize
with reads, and preserve worktree contents when unstaging (including unborn HEAD).
Rename unstaging resets both source and destination. `watchGitRepo` coalesces changes
across worktree, gitdir and common-dir using an injected directory watcher.
`GitService` takes an injected process runner and loads in plain Node with type stripping; `sparkGitService.ts` (`getGitService`, `createGitService`) wires in `@legendapp/spark/processes`. `applyPatch` writes the index by default; `target: "worktree"` runs `verify`, `git apply --check`, `verify` and `git apply` as one queued operation that finishes once the apply starts, even if the caller aborts.

From the repository root:

```sh
bun run test:git-core
bun run test:diff:git
```

The integration suite creates temporary fixture repositories and also exercises Diff's comparison, merge and watcher consumers. Its Jest configuration reuses Diff's native mocks for those consumer checks. Production source has no app imports. Diff's Jest target includes the moved service unit tests.
