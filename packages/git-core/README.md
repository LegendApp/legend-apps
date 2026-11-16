# Git core

Shared Git service, porcelain v2 status and for-each-ref parsers, and Git comparison source helpers for Legend Diff and Legend Git. The service owns per-repository serialization, cancellation, index-lock detection, and operation logs. Its runtime process adapter uses `@legendapp/spark/processes`.

From the repository root:

```sh
bun run test:git-core
bun run test:diff:git
```

The integration suite creates temporary fixture repositories and also exercises Diff's comparison, merge and watcher consumers. Its Jest configuration reuses Diff's native mocks for those consumer checks. Production source has no app imports. Diff's Jest target includes the moved service unit tests.
