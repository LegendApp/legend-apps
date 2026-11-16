#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD_DIR="$ROOT/packages/diff-parser/tests/.build"
SPARK_WORKSPACE="$(cd "$ROOT" && bun -e 'import { sharedDebugWorkspace } from "./scripts/lib/sharedDebugHost"; console.log(sharedDebugWorkspace);')"
PODS_ROOT="$SPARK_WORKSPACE/macos/Pods"
PODS_PUBLIC_HEADERS="$PODS_ROOT/Headers/Public"
PODS_PRIVATE_HEADERS="$PODS_ROOT/Headers/Private"
GIT2_ROOT="$PODS_ROOT/LegendLibGit2"
NITRO_HEADERS="$PODS_PUBLIC_HEADERS/NitroModules"
TEST_BINARY="$BUILD_DIR/native_unified_diff_parser_test"
GIT_FIXTURE="$BUILD_DIR/git-fixture"
NO_NEWLINE_FIXTURE="$BUILD_DIR/no-newline-fixture"
NO_NEWLINE_DIFF="$BUILD_DIR/no-newline-fixture.diff"
EXCLUDE_FIXTURE="$BUILD_DIR/exclude-fixture"

MISSING_PATHS=()
for required_path in \
  "$NITRO_HEADERS/NitroDefines.hpp" \
  "$GIT2_ROOT/build/include/git2.h" \
  "$GIT2_ROOT/build/libgit2.a"; do
  if [[ ! -f "$required_path" ]]; then
    MISSING_PATHS+=("$required_path")
  fi
done

if [[ ${#MISSING_PATHS[@]} -gt 0 ]]; then
  echo "Native Diff parser dependencies are missing. Searched:" >&2
  printf '  %s\n' "${MISSING_PATHS[@]}" >&2
  echo "Run: bun run diff pods macos" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
rm -rf "$GIT_FIXTURE"
mkdir -p "$GIT_FIXTURE/src" "$GIT_FIXTURE/assets"

cat > "$GIT_FIXTURE/src/App.tsx" <<'EOF'
export function App() {
  return null;
}

export const outsideNearContext = "base";
export const outsideFullFileContext = "base";
EOF
cat > "$GIT_FIXTURE/src/Deleted.ts" <<'EOF'
export const removed = true;
EOF
cat > "$GIT_FIXTURE/src/Conflict.ts" <<'EOF'
export const side = "base";
EOF
cat > "$GIT_FIXTURE/src/Whitespace.ts" <<'EOF'
export const spaced = true;
EOF
printf '\x00\x01\x02\x03' > "$GIT_FIXTURE/assets/logo.bin"

git -C "$GIT_FIXTURE" init --quiet
git -C "$GIT_FIXTURE" config user.email "diff-parser-native@example.com"
git -C "$GIT_FIXTURE" config user.name "Diff Parser Native"
git -C "$GIT_FIXTURE" add .
git -C "$GIT_FIXTURE" commit --quiet -m "initial fixture"
git -C "$GIT_FIXTURE" branch compare-base
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

export const outsideNearContext = "base";
export const outsideFullFileContext = "base";
EOF
cat > "$GIT_FIXTURE/src/NewFile.ts" <<'EOF'
export const added = true;
EOF
cat > "$GIT_FIXTURE/src/Whitespace.ts" <<'EOF'
export   const   spaced = true;
EOF
rm "$GIT_FIXTURE/src/Deleted.ts"
printf '\xff\x00\xfe\x01' > "$GIT_FIXTURE/assets/logo.bin"

rm -rf "$NO_NEWLINE_FIXTURE"
mkdir -p "$NO_NEWLINE_FIXTURE"
printf 'first\nlast' > "$NO_NEWLINE_FIXTURE/no-newline.txt"
printf 'a\nb' > "$NO_NEWLINE_FIXTURE/fixed.txt"
printf 'a\nb\n' > "$NO_NEWLINE_FIXTURE/dropped.txt"
for line in 1 2 3 4 5 6 7 8 9 10 11 12; do echo "rename $line"; done > "$NO_NEWLINE_FIXTURE/old name.txt"
git -C "$NO_NEWLINE_FIXTURE" init --quiet
git -C "$NO_NEWLINE_FIXTURE" config user.email "diff-parser-native@example.com"
git -C "$NO_NEWLINE_FIXTURE" config user.name "Diff Parser Native"
git -C "$NO_NEWLINE_FIXTURE" add .
git -C "$NO_NEWLINE_FIXTURE" commit --quiet -m "initial fixture"
printf 'first\nchanged last' > "$NO_NEWLINE_FIXTURE/no-newline.txt"
printf 'a\nb\n' > "$NO_NEWLINE_FIXTURE/fixed.txt"
printf 'a\nb' > "$NO_NEWLINE_FIXTURE/dropped.txt"
git -C "$NO_NEWLINE_FIXTURE" mv "old name.txt" 'renamed "quoted" näme.txt'
sed -i '' 's/^rename 6$/rename six/' "$NO_NEWLINE_FIXTURE/renamed \"quoted\" näme.txt"
git -C "$NO_NEWLINE_FIXTURE" -c core.quotepath=on diff --no-color -M HEAD > "$NO_NEWLINE_DIFF"

rm -rf "$EXCLUDE_FIXTURE"
mkdir -p "$EXCLUDE_FIXTURE/src" "$EXCLUDE_FIXTURE/.review" "$EXCLUDE_FIXTURE/docs/generated"
echo "keep" > "$EXCLUDE_FIXTURE/src/keep.ts"
echo "review" > "$EXCLUDE_FIXTURE/.review/tracked.md"
echo "generated" > "$EXCLUDE_FIXTURE/docs/generated/tracked.md"
git -C "$EXCLUDE_FIXTURE" init --quiet
git -C "$EXCLUDE_FIXTURE" config user.email "diff-parser-native@example.com"
git -C "$EXCLUDE_FIXTURE" config user.name "Diff Parser Native"
git -C "$EXCLUDE_FIXTURE" add .
git -C "$EXCLUDE_FIXTURE" commit --quiet -m "initial fixture"
echo "keep changed" > "$EXCLUDE_FIXTURE/src/keep.ts"
echo "review changed" > "$EXCLUDE_FIXTURE/.review/tracked.md"
echo "generated changed" > "$EXCLUDE_FIXTURE/docs/generated/tracked.md"
mkdir -p "$EXCLUDE_FIXTURE/.review/nested/deep" "$EXCLUDE_FIXTURE/.reviewer" "$EXCLUDE_FIXTURE/docs/.review"
echo "untracked" > "$EXCLUDE_FIXTURE/.review/nested/deep/story.md"
echo "untracked" > "$EXCLUDE_FIXTURE/.reviewer/keep.md"
echo "untracked" > "$EXCLUDE_FIXTURE/docs/.review/keep.md"
echo "untracked" > "$EXCLUDE_FIXTURE/docs/generated-notes.md"

HISTORY_FIXTURE="$BUILD_DIR/history-fixture"
HISTORY_GRAPH_FIXTURE="$BUILD_DIR/history-graph-fixture"
HISTORY_DETACHED_FIXTURE="$BUILD_DIR/history-detached-fixture"
HISTORY_UNBORN_FIXTURE="$BUILD_DIR/history-unborn-fixture"
rm -rf "$HISTORY_FIXTURE" "$HISTORY_GRAPH_FIXTURE" "$HISTORY_DETACHED_FIXTURE" "$HISTORY_UNBORN_FIXTURE"
git init --quiet "$HISTORY_FIXTURE"
python3 "$ROOT/packages/diff-parser/tests/history-fixture.py" | git -C "$HISTORY_FIXTURE" fast-import --quiet
git -C "$HISTORY_FIXTURE" checkout --quiet main
git -C "$HISTORY_FIXTURE" log --topo-order --format='%H %P' > "$HISTORY_FIXTURE.expected"
git clone --quiet --no-local "$HISTORY_FIXTURE" "$HISTORY_GRAPH_FIXTURE"
git -C "$HISTORY_GRAPH_FIXTURE" commit-graph write --reachable
test -f "$HISTORY_GRAPH_FIXTURE/.git/objects/info/commit-graph"
git -C "$HISTORY_GRAPH_FIXTURE" log --topo-order --format='%H %P' > "$HISTORY_GRAPH_FIXTURE.expected"
git clone --quiet --no-local "$HISTORY_FIXTURE" "$HISTORY_DETACHED_FIXTURE"
git -C "$HISTORY_DETACHED_FIXTURE" checkout --quiet --detach main~7
git -C "$HISTORY_DETACHED_FIXTURE" log --topo-order --format='%H %P' > "$HISTORY_DETACHED_FIXTURE.expected"
git init --quiet "$HISTORY_UNBORN_FIXTURE"
GRAPH_FIXTURE="$BUILD_DIR/graph-fixture"
rm -rf "$GRAPH_FIXTURE"
git init --quiet "$GRAPH_FIXTURE"
python3 "$ROOT/packages/diff-parser/tests/graph-fixture.py" | git -C "$GRAPH_FIXTURE" fast-import --quiet
git -C "$GRAPH_FIXTURE" checkout --quiet main
git -C "$GRAPH_FIXTURE" log --topo-order --format='%H %P' > "$GRAPH_FIXTURE.expected"
git -C "$GRAPH_FIXTURE" log --topo-order --all --format='%H %P' > "$GRAPH_FIXTURE.all"
git -C "$GRAPH_FIXTURE" log --topo-order --format='%H %P' unrelated > "$GRAPH_FIXTURE.linear"
git -C "$GRAPH_FIXTURE" -c user.name=Tagger -c user.email=tagger@example.com tag -a -m "Annotated" unrelated-annotated unrelated
BLAME_FIXTURE="$BUILD_DIR/blame-fixture"
bash "$ROOT/packages/diff-parser/tests/blame-fixture.sh" "$BLAME_FIXTURE" > /dev/null

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
  "$ROOT/packages/diff-parser/cpp/DiffInlineChange.cpp" \
  "$ROOT/packages/diff-parser/cpp/DiffSideBySideProjection.cpp" \
  "$ROOT/packages/diff-parser/tests/native_unified_diff_parser_test.cpp" \
  "$GIT2_ROOT/build/libgit2.a" \
  -liconv \
  -lz \
  -framework CoreFoundation \
  -framework Security \
  -o "$TEST_BINARY"

"$TEST_BINARY" "$GIT_FIXTURE" "$NO_NEWLINE_FIXTURE" "$NO_NEWLINE_DIFF" "$EXCLUDE_FIXTURE" "$HISTORY_FIXTURE" "$HISTORY_GRAPH_FIXTURE" "$HISTORY_DETACHED_FIXTURE" "$HISTORY_UNBORN_FIXTURE" "$GRAPH_FIXTURE" "$BLAME_FIXTURE"
