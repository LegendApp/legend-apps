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

Use a new output ZIP path each time. The script reports JSON and exits 1 if the app ZIP exceeds **25,000,000 bytes** or the optional compiler ZIP exceeds **15,500,000 bytes**. Override these local regression guardrails with `--budget-mb` and `--compiler-budget-mb` (decimal MB). They are not release promises or wired into CI. Check both downloads separately: compiler bytes are deferred until first use, not part of the app download. Read the exact compiler filename from `.spark/compiler/artifact.json`.

The ZIP uses `ditto -c -k -rsrc --sequesterRsrc --keepParent --zlibCompressionLevel 9`, matching the notarization upload archive shape. The check does not sign, notarize, upload, release or bump versions. Signing and stapling can change the final distribution's size. Logical app bytes sum regular files without following symlinks; components partition executable, JS bundle, frameworks/dylibs, assets (including fonts), helpers and metadata. Filesystem allocation and compressed ZIP size are different metrics.

On the shared build machine, run builds, checks and archiving through the existing heavy queue. Use `~/devroot/scripts/heavy slides --tier release --priority low -- bun run slides build macos` for the low-priority Release lane; the wrapper's explicit tier overrides `APP_LOCK_TIER`. Check available disk before starting and monitor it during builds. Use the repository's supported Node version and cached dependencies; do not install packages manually.

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

Compiler package filtering keeps licenses, manifests, runtime TypeScript, CSS and native binaries while omitting development/test/documentation files, declarations and source maps. React's production JSX development-runtime entry remains available for explicit Webview imports. The trimmed helper is production-only: `NODE_ENV=development` fails with module-not-found errors for removed development builds. Verify the packaged helper outside the repository with Bun and Node, including CSS generation, worklets, Webviews and effect-pack compilation after any filter change.

The separate download contract is described in [compiler downloads](slides-compiler-download.md). The merged [HTML export action](https://github.com/LegendApp/legend-apps/pull/6) includes the browser runtime closure and full Skottie-capable CanvasKit. The integrated measurement below replaces the earlier 12 MB compiler guardrail with 15.5 MB; the app guardrail remains 25 MB.

## Fresh arm64 Release measurement (2026-10-26)

Base: `55241e092b8fc704d06ae97d50783c41c85ab1e0` (`slides-compiler-on-demand`, PR #5). Implementation: `23f32dcc0f62d9beee1196893e5b2c53d7806628`; subsequent documentation edits do not change the measured payload. macOS 26.6.1, Xcode 26.6 (17F113), macOS SDK 26.5, Node 24.19.0, Bun 1.3.14. Thin arm64, ad hoc signed, version unchanged. These are newly built Release products, not the October 14 artifact. No native project changes are committed.

The baseline used fresh DerivedData (no warm Slides DerivedData existed), with existing Pods cloned. It was interrupted to correct queue selection, then completed with the partial build inputs. The final Release rebuilt with the trimmed compiler descriptor using that same DerivedData. Both used the same native graph, Release settings and link-map instrumentation. Both ZIPs contain the same `LegendSlides.app` basename and were measured after Hermes stripping and app signing.

| App bytes | Before | After |
| --- | ---: | ---: |
| Logical total | 49,589,379 | 49,589,379 |
| Notarization-style ZIP | 20,429,224 | 20,429,220 |
| Native executable | 35,676,896 | 35,676,896 |
| Hermes JS bundle | 7,472,639 | 7,472,639 |
| Frameworks/dylibs | 2,256,810 | 2,256,810 |
| Assets and other resources | 4,145,350 | 4,145,350 |
| Embedded helpers | 0 | 0 |
| Metadata/signatures | 37,684 | 37,684 |

The four-byte ZIP difference is incidental to the changed compiler pin and signatures; there is no meaningful app download saving from these trims. Hermes is the only embedded dynamic framework; the native engines are statically linked. Assets include `Assets.car` (3,463,640 bytes), KaTeX fonts (513,664), `AppIcon.icns` (93,762) and other resources (74,284). Asset-catalog inspection identifies app-icon artwork/layers; no proven dead resource was removed. Math fonts and all native engines remain.

The executable UUID is `41ED6913-E9D0-3EE3-82C0-AB614439F003`. Its bytes excluding the embedded code signature are identical before/after (SHA-256 `8deb8a1cc5d66963451b4da362507728f540f2e8cb86eeac6204e322b840da2c`), as is the entire link map. Both the final app and compiler pass `codesign --verify --deep --strict` after ZIP extraction. No source-map files ship in the app; the extracted compiler contains no source maps, Flow files, README files or development JS variants.

| Optional compiler step | Logical helper bytes | ZIP bytes | ZIP saving from prior step |
| --- | ---: | ---: | ---: |
| Baseline | 27,875,992 | 10,271,440 | — |
| Omit Flow metadata and package docs | 27,583,993 | 10,209,074 | 62,366 |
| Omit unused development builds | 27,395,166 | 10,156,701 | 52,373 |
| Final artifact packaged with the app | 27,395,166 | 10,156,704 | −3 (repack variation) |

The first trim removes 14 files / 287,623 raw bytes; the second removes 16 / 182,911. Re-signing also reduces resource-seal metadata, so logical helper savings exceed removed source-file bytes. The final optional download saves **114,736 bytes (1.12%)** against baseline; logical savings are **480,826 bytes**. The three-byte difference between isolated trims and the freshly packaged final artifact is ZIP metadata variation. The compiler retains the same native esbuild/lightningcss/oxide binaries and bundled runtime features. These files are signed and archived before the new pin enters the app; no artifact was hosted or published.

Both isolated trims generate byte-identical worklet/Webview code and CSS for the same external fixture. Focused packaged-helper tests cover Bun and Node, production JSX runtime resolution, CSS, worklets, effect installation, cache repair and signatures. The local budget check passes for both app and compiler. Effective Release settings already have `DEAD_CODE_STRIPPING=YES`, `DEPLOYMENT_POSTPROCESSING=YES`, `LLVM_LTO=YES_THIN`, `GCC_OPTIMIZATION_LEVEL=z`, `STRIP_INSTALLED_PRODUCT=YES`, `STRIP_STYLE=all`. An additional `strip -S -x` on an executable copy changes its size by **0 bytes**; no redundant setting or postprocessing was added.

### Executable attribution

The app map contains **34,725,234 live symbol bytes**. Thin-LTO objects retain generated numeric names, so library totals are partial attribution rather than full feature costs. Alignment, signatures, headers, shared code and LTO prevent interpreting these totals as downloadable or removable module sizes.

| Largest library inputs | Live symbol bytes |
| --- | ---: |
| `libskia.a` | 5,694,501 |
| `libwebgpu_dawn.a` | 4,095,672 |
| `libratex_ffi.a` | 2,628,290 |
| `liblottie-ios.a` | 1,754,955 |
| `libreact-native-skia.a` | 1,135,349 |
| `libExpoModulesCore.a` | 965,291 |
| `libReactNativeEnrichedMarkdown.a` | 803,538 |
| `libskshaper.a` | 779,254 |
| `libreact-native-webgpu.a` | 701,100 |

| Largest symbols | Input | Bytes |
| --- | --- | ---: |
| `_ts_parse_table` | `1058.arm64.thinlto.o` | 917,262 |
| `_ts_parse_table` | `1059.arm64.thinlto.o` | 897,136 |
| `_ts_parse_table` | `1057.arm64.thinlto.o` | 701,688 |
| `_ts_small_parse_table` | `1047.arm64.thinlto.o` | 648,794 |
| `compact unwind info` | `linker synthesized` | 387,248 |
| `_ts_small_parse_table` | `1058.arm64.thinlto.o` | 334,742 |
| `_ts_small_parse_table` | `1059.arm64.thinlto.o` | 332,512 |
| `_ts_parse_table` | `1048.arm64.thinlto.o` | 327,600 |
| `_ts_parse_table` | `1047.arm64.thinlto.o` | 295,680 |
| `_ts_parse_table` | `1052.arm64.thinlto.o` | 259,840 |

The largest individual data symbols are tree-sitter parse tables; removing them would reduce supported native syntax features. The full map and top-20 JSON are retained as local measurement artifacts, not committed binary files. The CLI regenerates that summary with `--link-map`.

Validation: 11 focused tests passed (113 assertions), the changed scripts passed scoped TypeScript checks, and Slides/macOS identity and native-package verification passed. No full-project typecheck or native UI feature walkthrough was run. This historical measurement excludes export-action PR #6; use the integrated compiler measurement below for the combined payload.


## Integrated compiler and HTML exports (2026-10-27)

Base: `b8ae4802da9b6874b4c1dacd6b391dc4f66a8a1e`, after merging PRs #4–#7. Measured source: `25b5b53dc23d25cae1268d414864300f52056c1e`. macOS arm64, Node 24.19.0, Bun 1.3.14, matching cached dependencies, ad hoc signed helpers. Compiler artifacts were packaged directly with `packageSlidesCompilerArtifact`; no native app was rebuilt. The 12 MB guardrail failed on the combined baseline.

| Payload (bytes) | Combined baseline | After shrinking |
| --- | ---: | ---: |
| Compiler ZIP | 15,952,356 | 15,054,995 |
| Installed helper, regular files | 41,188,315 | 35,330,933 |
| Demo HTML folder | 1,419,398 | 1,419,245 |
| Lottie HTML folder | 13,004,544 | 6,284,639 |
| Lottie files, sum of gzip-9 bytes | 5,115,737 | 4,028,904 |

Maximum ZIP compression saves 47,027 bytes; removing unreachable State adapters saves another 116,464 bytes. Brotli storage of the full CanvasKit WASM saves 734,133 ZIP bytes and 5,564,389 installed bytes. Gzipping the HTML WASM and full Roboto font before Base64 encoding saves 6,719,843 folder bytes against the preceding step and adds 255 bytes to the helper ZIP. Tiny player-size differences between packaging runs are not separate wins. The gzip totals compress each regular file separately and exclude HTTP headers; they are payload-size estimates, not network timing measurements.

The helper decompresses CanvasKit in memory during export, preserving the installed-size saving. Offline HTML uses the browser's `DecompressionStream("gzip")` and temporary blob URLs. The full WASM and font bytes are preserved, including Skottie and non-Latin glyph coverage; no native rendering engines, syntax languages, locales or font variants were removed. Maximum-quality Brotli increases packaging time; the artifact test allows two minutes for its two helper builds.

Signed extraction/cache tests, Bun and Node compilation/exports, cancellation, destination replacement and local-only debug maps pass. Baseline and new demo/Lottie folders render in headless Chrome through `file://` with networking disabled, no HTTP requests and no runtime errors. Other browsers and native UI were not exercised for these packaging changes.

Level 9 also reduces an unchanged older app fixture's ZIP from 30,974,075 to 30,891,940 bytes, with identical entry CRCs and sizes. That fixture still embeds its old helper and has unknown source provenance: this isolates archive compression and is not a measurement of the merged app. Its installed bytes are unchanged. The fresh native app figures above remain historical; no new native app download/install claim is made here.
