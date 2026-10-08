#!/usr/bin/env bash
set -euo pipefail
presentation_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$presentation_dir/../.." && pwd)"
cd "$repo_dir"
skia_dir="$(dirname "$(bun -e 'console.log(require.resolve("@shopify/react-native-skia/package.json", {paths: ["./apps/slides"]}))')")"
lib_dir="$(dirname "$(bun -e 'console.log(require.resolve("react-native-skia-apple-macos/package.json", {paths: [process.argv[1]]}))' "$skia_dir")")/libs/libskia.xcframework/macos-arm64_x86_64"
geometry_binary="$(mktemp "${TMPDIR:-/tmp}/legend-skia-display.XXXXXX")"
trap 'rm -f "$geometry_binary"' EXIT
clang++ -std=c++20 -fobjc-arc -framework AppKit -framework Metal \
  -framework MetalKit -framework QuartzCore -framework CoreVideo \
  -framework CoreText -framework CoreGraphics -framework ImageIO \
  -I"$skia_dir/apple" -I"$skia_dir/cpp/rnskia" \
  -I"$skia_dir/cpp/utils" -I"$skia_dir/cpp/skia" \
  -I"$repo_dir/node_modules/react-native/ReactCommon/jsi" \
  "$skia_dir/apple/MetalWindowContext.mm" \
  "$presentation_dir/tests/SkiaDisplayGeometry.test.mm" \
  "$lib_dir/libskia.a" -o "$geometry_binary"
"$geometry_binary"
