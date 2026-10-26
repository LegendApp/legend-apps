# Slides compiler downloads

macOS Slides downloads its existing compiler helper on first compiler use (opening a deck or a compiler-backed effects action). Native rendering features and the compiler payload are unchanged. Development builds still use the source compiler and a local Bun.

## Local production

`bun run slides build macos` (or `bun scripts/spark-app.ts slides build-release`) packages the helper **before** the app's Metro bundle. The build writes a ZIP and `artifact.json` under `shell/.legend/spark/slides-release/.spark/compiler/`. The ZIP contains the same bundled compiler, stylesheets, browser runtimes and native esbuild/lightningcss/oxide dependencies as the former embedded helper. It is signed before archiving (ad hoc by default; set `LEGEND_DEVELOPER_ID_APPLICATION` for Developer ID). Build each architecture on a matching Mac with that architecture's workspace dependencies. No runtime or package installation is added.

For an artifact-only local build, run `bun scripts/lib/slidesCompiler.ts <output-directory> [arm64|x64]`. This does not build, upload or distribute the app.

Babel embeds the descriptor's exact URL, SHA-256, compressed byte count and architecture through `EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_ARTIFACT`. The descriptor also keys Metro's persistent cache so a rebuild cannot retain an earlier pin. App and compiler must be built together; no remotely mutable manifest selects executable code. The app bundle no longer contains `Contents/Helpers/slides-compiler.helper`. Normal macOS packaging signs the app without modifying the external compiler archive.

## Hosting contract (manual; builds never upload)

Host each generated ZIP at `https://legend.so/slides/compiler/slides-compiler-darwin-<arch>-<sha256>.zip`, on the pack catalog's origin. Serve the exact ZIP bytes with HTTP 200, no redirect or transformation, and long-lived immutable caching. Keep old artifacts available while their app versions are supported. Publish/verify the artifact before distributing its matching app; an unpublished or missing artifact produces the retry message. `artifact.json` is local build evidence, not a runtime catalog. Do not re-sign or re-compress a ZIP after its pin has been embedded; rebuild the app if it changes. Artifact signing/notarization and app release remain manual release responsibilities.

## Cache and failures

The app stores `<sha256>.zip` and the extracted helper under its Application Support `compiler/` directory. Concurrent commands share one acquisition. Each app launch verifies the cached ZIP against the embedded SHA-256 and re-extracts it on first use, repairing missing or changed extracted files offline. Subsequent commands in that launch reuse the extracted helper. A partial download/extraction is staged separately and is never executed. Different app pins coexist; there is no automatic eviction of older compiler versions.

Without a cached ZIP, offline use cannot compile new decks. Connection, integrity and extraction failures show a specific message and a **Retry Compiler Download** action for the pending deck; effects actions retain their existing retry controls. Bun/Node selection and its separate on-demand Bun download are unchanged. Once acquired, the helper receives the same command arguments, environment, draft input and output handling as before.
