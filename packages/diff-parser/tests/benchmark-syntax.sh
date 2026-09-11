#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
syntax_root="$repo_root/packages/syntax-parser"
tree_build="$(mktemp -d "${TMPDIR:-/tmp}/legend-diff-syntax.XXXXXX")"
node "$syntax_root/scripts/compile-tree-sitter.ts" "$tree_build"
clang++ -std=c++20 -O2 -Wall -Wextra -Werror \
  "$repo_root/packages/diff-parser/tests/TreeSitterDiff.test.cpp" \
  "$syntax_root/cpp/TreeSitterHighlighter.cpp" "$tree_build/"*.o -o "$tree_build/test"
"$tree_build/test"
if [[ "${1:-}" != "--benchmark" ]]; then exit 0; fi
syntax_headers="$repo_root/shell/.legend/workspaces/dev/code/macos/Pods/Headers"
textmate_root="$syntax_root/vendor/TextMateLib"
clang++ -std=c++20 -O2 -framework CoreFoundation \
  -I"$syntax_headers/Public" -I"$syntax_headers/Public/NitroModules" -I"$syntax_headers/Private/NitroModules" \
  -I"$syntax_headers/Public/React-jsi" -I"$syntax_headers/Public/ReactCommon" -I"$syntax_headers/Public/React-callinvoker" \
  -I"$textmate_root/packages/tml-cpp/build" \
  "$repo_root/packages/diff-parser/tests/DiffSyntaxBenchmark.cpp" "$syntax_root/cpp/TreeSitterHighlighter.cpp" \
  "$syntax_root/cpp/SyntaxHighlighter.cpp" \
  "$textmate_root/packages/tml-cpp/build/libtml.a" "$textmate_root/packages/tml-cpp/build/oniguruma/lib/libonig.a" \
  "$tree_build/"*.o -o "$tree_build/benchmark"
printf 'Benchmark binary: %s\n' "$tree_build/benchmark"
shift
# Explicit language/file pairs; no network or synthetic duplication of files.
while [[ $# -ge 2 ]]; do
  language="$1"; fixture="$2"; shift 2
  for repetition in 1 2 3; do
    for position in first tail; do
      backends="textmate tree-sitter"
      if [[ "$repetition" == 2 ]]; then backends="tree-sitter textmate"; fi
      for backend in $backends; do
        "$tree_build/benchmark" "$backend" "$language" "$fixture" \
          "$textmate_root/thirdparty/textmate-grammars-themes/packages" "$position"
      done
    done
  done
done
