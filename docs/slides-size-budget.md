# Slides macOS download size

Measure a newly built Release app, including its matching compiler pin. Debug builds and old app artifacts are not comparable. Keep Skia, Lottie, WebGPU and Reanimated enabled: native rendering features are part of the host, even when effect sources come from downloadable packs.

## Local check

```sh
bun run slides build macos
bun scripts/slides-size-budget.ts \
  shell/.legend/spark/slides-release/.spark/products/macos-arm64/release/LegendSlides.app \
  --zip /tmp/LegendSlides-size.zip \
  --compiler shell/.legend/spark/slides-release/.spark/compiler/slides-compiler-darwin-arm64-<sha256>.zip
```

Use a new output ZIP path each time. The script reports JSON and exits 1 if the app ZIP exceeds **25,000,000 bytes** or the optional compiler ZIP exceeds **12,000,000 bytes**. Override these local regression guardrails with `--budget-mb` and `--compiler-budget-mb` (decimal MB). They are not release promises or wired into CI. Check both downloads separately: compiler bytes are deferred until first use, not part of the app download. Read the exact compiler filename from `.spark/compiler/artifact.json`.

The ZIP uses `ditto -c -k --sequesterRsrc --keepParent`, matching the notarization upload archive shape. The check does not sign, notarize, upload, release or bump versions. Signing and stapling can change the final distribution's size. Logical app bytes sum regular files without following symlinks; components partition executable, JS bundle, frameworks/dylibs, assets, helpers and metadata. Assets include fonts and resource-bundle metadata. Filesystem allocation and compressed ZIP size are different metrics.

On the shared build machine, run builds, checks and archiving through the existing heavy queue; Release work uses its low-priority background lane. Check available disk before starting and monitor it during builds. Use the repository's supported Node version and cached dependencies; do not install packages manually.

## Linker map

Create a local, uncommitted `linkmap.xcconfig` outside the app:

```xcconfig
LD_GENERATE_MAP_FILE = YES
LD_MAP_FILE_PATH = $(TARGET_TEMP_DIR)/$(PRODUCT_NAME)-$(CURRENT_ARCH)-LinkMap.txt
```

Set `XCODE_XCCONFIG_FILE` to its absolute path for the Release build. Ensure the build actually invokes Xcode instead of reusing a cached app; remove only that generated workspace's `.spark/release-build.json` receipt when a rebuild is needed. Keep warm DerivedData. Find the app target's `LegendSlides-arm64-LinkMap.txt` under `.spark/DerivedData/macos-arm64/Build/Intermediates.noindex/`, then add `--link-map <path>` to the size check. The JSON includes the 20 largest live symbols and totals by input library. Keep full maps as local artifacts: they contain build-machine paths and can be large.

Map totals attribute linked symbols; they exclude dead-stripped symbols and do not equal executable file bytes (alignment, headers, signatures and other sections also occupy space). Largest-symbol names may be C++/Swift mangled; use `xcrun llvm-cxxfilt` or `xcrun swift-demangle` for inspection. Do not infer removable native features from these totals.

The Spark SDK already requests Release dead-code stripping, thin LTO, size optimization and deployment postprocessing. The build strips Hermes separately. Inspect effective Xcode settings and the produced binary before claiming additional strip savings.

## Compiler packaging

Compiler package filtering keeps licenses, manifests, runtime TypeScript, CSS and native binaries while omitting development/test/documentation files, declarations and source maps. React's production JSX development-runtime entry remains available for explicit Webview imports. Verify the packaged helper outside the repository with Bun and Node, including CSS generation, worklets, Webviews and effect-pack compilation after any filter change.

The compiler-on-demand branch supplies the separate download contract; see [compiler downloads](slides-compiler-download.md). The unmerged [HTML export action](https://github.com/LegendApp/legend-apps/pull/6) adds a browser runtime dependency closure to the helper. This work does not depend on that PR; remeasure its combined compiler artifact after integration rather than carrying this branch's optional-download number forward.
