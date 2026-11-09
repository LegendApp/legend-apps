# Slides built-in compiler

macOS Release apps include the deck compiler in `Contents/Helpers/slides-compiler.helper`. Opening a deck and compiler-backed effects actions do not download compiler code. Development builds use the checkout compiler and local Bun instead.

## Packaging

`bun run slides build macos` packages the compiler before preparing the Release workspace. `.spark/compiler/helper/` contains a signed compiler archive (`compiler.zip`) and its SHA-256-pinned preparation launcher. Spark copies this portable helper into the app before signing. Its preparation fingerprint includes the archive, so changed compiler bytes invalidate app reuse. Build each architecture on a matching Mac with matching workspace dependencies.

For compiler-only packaging, use `bun scripts/lib/slidesCompiler.ts <output-directory> [arm64|x64]`. No upload or hosting step is required. The archive retains the compiler, stylesheets, Webview runtimes and native esbuild/lightningcss/oxide dependencies, including internal dependency links. The outer Spark helper contains regular files only.

## First use and failures

The app launches its bundled helper through Spark. On first use in each app session, the launcher verifies the bundled archive and extracts it into Application Support under `compiler/<sha256>/`, repairing changed or missing extracted files. Concurrent commands share preparation; later commands reuse it. Failed extraction is staged separately and never executed. Older content-addressed compiler directories are not automatically evicted.

Integrity or preparation failures offer **Retry Compiler Preparation** for the pending deck. A damaged app should be rebuilt or reinstalled; connecting to the internet cannot repair its bundled archive.

The JavaScript runtime is separate: use an existing Bun 1.3+ or Node 22+, or download Bun through Settings. A fresh machine without either runtime still needs that one-time setup. Once the runtime is available, compiler preparation works offline without a source checkout.
