#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="$ROOT/packages/diff-parser/tests/.build"
PODS_PUBLIC_HEADERS="$ROOT/shell/.legend/workspaces/dev/diff/macos/Pods/Headers/Public"
PODS_PRIVATE_HEADERS="$ROOT/shell/.legend/workspaces/dev/diff/macos/Pods/Headers/Private"
GIT2_ROOT="$ROOT/shell/.legend/workspaces/dev/diff/macos/Pods/LegendLibGit2"
NITRO_HEADERS="$PODS_PUBLIC_HEADERS/NitroModules"
TEST_BINARY="$BUILD_DIR/native_unified_diff_parser_test"
GIT_FIXTURE="$BUILD_DIR/git-fixture"

if [[ ! -d "$NITRO_HEADERS" ]]; then
  echo "Nitro headers are missing at $NITRO_HEADERS"
  echo "Run: bun run diff verify macos"
  exit 1
fi

if [[ ! -f "$GIT2_ROOT/build/libgit2.a" ]]; then
  echo "libgit2 is missing at $GIT2_ROOT/build/libgit2.a"
  echo "Run: bun run diff verify macos"
  exit 1
fi

mkdir -p "$BUILD_DIR"
rm -rf "$GIT_FIXTURE"
mkdir -p "$GIT_FIXTURE/src" "$GIT_FIXTURE/assets"

cat > "$GIT_FIXTURE/src/App.tsx" <<'EOF'
export function App() {
  return null;
}
EOF
cat > "$GIT_FIXTURE/src/Deleted.ts" <<'EOF'
export const removed = true;
EOF
cat > "$GIT_FIXTURE/src/Conflict.ts" <<'EOF'
export const side = "base";
EOF
printf '\x00\x01\x02\x03' > "$GIT_FIXTURE/assets/logo.bin"

git -C "$GIT_FIXTURE" init --quiet
git -C "$GIT_FIXTURE" config user.email "diff-parser-native@example.com"
git -C "$GIT_FIXTURE" config user.name "Diff Parser Native"
git -C "$GIT_FIXTURE" add .
git -C "$GIT_FIXTURE" commit --quiet -m "initial fixture"
INITIAL_BRANCH="$(git -C "$GIT_FIXTURE" branch --show-current)"

git -C "$GIT_FIXTURE" checkout --quiet -b conflict-branch
cat > "$GIT_FIXTURE/src/Conflict.ts" <<'EOF'
export const side = "branch";
EOF
git -C "$GIT_FIXTURE" commit --quiet -am "branch conflict"

git -C "$GIT_FIXTURE" checkout --quiet "$INITIAL_BRANCH"
cat > "$GIT_FIXTURE/src/Conflict.ts" <<'EOF'
export const side = "main";
EOF
git -C "$GIT_FIXTURE" commit --quiet -am "main conflict"
git -C "$GIT_FIXTURE" merge --quiet conflict-branch || true

cat > "$GIT_FIXTURE/src/App.tsx" <<'EOF'
export function App() {
  return "changed";
}
EOF
cat > "$GIT_FIXTURE/src/NewFile.ts" <<'EOF'
export const added = true;
EOF
rm "$GIT_FIXTURE/src/Deleted.ts"
printf '\xff\x00\xfe\x01' > "$GIT_FIXTURE/assets/logo.bin"

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
  -I"$GIT2_ROOT/build/include" \
  -I"$GIT2_ROOT/build/gen_headers" \
  "$ROOT/packages/diff-parser/cpp/DiffParserCore.cpp" \
  "$ROOT/packages/diff-parser/tests/native_unified_diff_parser_test.cpp" \
  "$GIT2_ROOT/build/libgit2.a" \
  -liconv \
  -lz \
  -framework CoreFoundation \
  -framework Security \
  -o "$TEST_BINARY"

"$TEST_BINARY" "$GIT_FIXTURE"
