# Legend Hello World

A minimal macOS app using the shared `shell/` host, manifest-based app selection,
Metro configuration, React Compiler, and Uniwind. It displays centered
32-point **Hello, world!** text on white, matching the minimal apps in the
sibling `chat-history-comparison` repository.

The release manifest selects no app-specific native modules and disables Expo
native modules on macOS. The shared shell and its normal styling/runtime
infrastructure remain in use, so this is a baseline for a Legend shell app.
Development builds use the repository's shared superset of native modules; use
release builds when measuring the minimal shell footprint.

From the repository root, install dependencies with `bun install`, then use the
standard commands. Start Metro and run the app in separate terminals:

```sh
bun run hello-world start macos
bun run hello-world run macos
```

The default Metro port is **19097**. Other standard actions work as usual:

```sh
bun run hello-world verify macos
bun run hello-world pods macos
bun run hello-world open macos
bun run hello-world build macos
```

The macOS bundle ID is `so.legend.helloworld.macos`. Only macOS is enabled in
this app's manifest. Distribution metadata and automatic updates are not
configured for this minimal app.

For the sibling comparison suite, export a release app built through this
infrastructure:

```sh
bun run hello-world:benchmark:export --output /absolute/path/to/HelloWorld.app
```
