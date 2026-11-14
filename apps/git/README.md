# Legend Git

An empty native macOS shell for Legend Git, with a source-list sidebar and native
window toolbar. Open Repository shows the system folder chooser; repository loading
and Git operations will follow.

From the repository root:

```sh
bun run git run macos
bun run git start macos
bun run git verify macos
bun run test:git --runInBand
```

Spark generates the macOS host under `shell/.legend/spark/git-shared-debug`; no
app-specific native project or URL scheme is needed for this scaffold.
