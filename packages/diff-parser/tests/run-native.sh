#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="$ROOT/packages/diff-parser/tests/.build"
PODS_PUBLIC_HEADERS="$ROOT/shell/.legend/workspaces/dev/diff/macos/Pods/Headers/Public"
PODS_PRIVATE_HEADERS="$ROOT/shell/.legend/workspaces/dev/diff/macos/Pods/Headers/Private"
NITRO_HEADERS="$PODS_PUBLIC_HEADERS/NitroModules"
TEST_BINARY="$BUILD_DIR/native_unified_diff_parser_test"

if [[ ! -d "$NITRO_HEADERS" ]]; then
  echo "Nitro headers are missing at $NITRO_HEADERS"
  echo "Run: bun run diff verify macos"
  exit 1
fi

mkdir -p "$BUILD_DIR"

clang++ \
  -std=c++20 \
  -Wall \
  -Wextra \
  -I"$ROOT/packages/diff-parser/cpp" \
  -I"$ROOT/packages/diff-parser/nitrogen/generated/shared/c++" \
  -I"$PODS_PUBLIC_HEADERS" \
  -I"$PODS_PUBLIC_HEADERS/NitroModules" \
  -I"$PODS_PRIVATE_HEADERS/NitroModules" \
  -I"$PODS_PUBLIC_HEADERS/React-jsi" \
  -I"$PODS_PUBLIC_HEADERS/ReactCommon" \
  -I"$PODS_PUBLIC_HEADERS/ReactCommon/react" \
  -I"$PODS_PUBLIC_HEADERS/React-callinvoker" \
  "$ROOT/packages/diff-parser/cpp/DiffParserCore.cpp" \
  "$ROOT/packages/diff-parser/tests/native_unified_diff_parser_test.cpp" \
  -o "$TEST_BINARY"

"$TEST_BINARY"
