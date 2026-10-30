#!/usr/bin/env bash
# Runs the patched Worklets AnimationFrameQueue against a real 60 Hz display link.
# Usage: run-react-native-worklets-frame-queue.sh [AnimationFrameQueue.mm]
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
modules="${SPARK_NODE_MODULES:-$repo/shell/.legend/spark/node_modules}"
worklets="$modules/react-native-worklets"
rn="$modules/react-native-macos"
queue="${1:-$worklets/apple/worklets/apple/AnimationFrameQueue.mm}"
dir="$(mktemp -d "${TMPDIR:-/tmp}/worklets-frame-queue.XXXXXX")"
trap 'rm -rf "$dir"' EXIT
mkdir "$dir/include"
ln -s "$rn/React/Base" "$dir/include/React"
flags=(-fobjc-arc -O1 -DNDEBUG -Wno-deprecated-declarations -I"$dir/include" -I"$rn/React/Base" -I"$rn/ReactCommon"
  -I"$worklets/apple" -I"$worklets/Common/cpp")
clang -x objective-c "${flags[@]}" -c "$rn/React/Base/macOS/RCTPlatformDisplayLink.m" -o "$dir/link.o"
for source in "$queue" "$worklets/apple/worklets/apple/SlowAnimations.mm" "$(dirname "$0")/react-native-worklets-frame-queue.test.mm"; do
  clang++ -x objective-c++ -std=c++20 "${flags[@]}" -c "$source" -o "$dir/$(basename "$source").o"
done
clang++ -fobjc-arc "$dir"/*.o -framework Foundation -framework QuartzCore -framework CoreVideo -framework CoreGraphics -o "$dir/test"
"$dir/test"
