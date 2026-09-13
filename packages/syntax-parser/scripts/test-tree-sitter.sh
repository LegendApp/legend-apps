#!/usr/bin/env bash
set -euo pipefail
syntax_root="$(cd "$(dirname "$0")/.." && pwd)"
tree_build="$(mktemp -d "${TMPDIR:-/tmp}/legend-tree-sitter.XXXXXX")"
tree_vendor="$syntax_root/vendor/tree-sitter"
git -C "$syntax_root/../.." apply --reverse --check "$syntax_root/patches/tree-sitter-query-dispatch.patch"
node "$syntax_root/scripts/embed-tree-sitter-queries.ts" --check
node "$syntax_root/scripts/compile-tree-sitter.ts" "$tree_build"
clang++ -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/QueryRegex.test.cpp" -o "$tree_build/query-regex-test"
"$tree_build/query-regex-test"
clang++ -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/WeightedLruCache.test.cpp" -o "$tree_build/lru-test"
"$tree_build/lru-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/TreeSitterHighlighter.test.cpp" \
  "$syntax_root/cpp/TreeSitterHighlighter.cpp" "$tree_build/"*.o -o "$tree_build/test"
"$tree_build/test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/QueryTraversal.test.cpp" \
  "$syntax_root/cpp/TreeSitterHighlighter.cpp" "$tree_build/"*.o -o "$tree_build/query-traversal-test"
"$tree_build/query-traversal-test"
clang++ -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/QueryDispatch.test.cpp" \
  "$tree_build/"*.o -o "$tree_build/query-dispatch-test"
"$tree_build/query-dispatch-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/MarkdownHighlighter.test.cpp" \
  "$syntax_root/cpp/TreeSitterHighlighter.cpp" "$tree_build/"*.o -o "$tree_build/markdown-test"
"$tree_build/markdown-test" "$syntax_root/../../apps/slides/examples/"*.mdx \
  "$syntax_root/../../apps/slides/decks/react-native-desktop/talk.mdx" "$syntax_root/TREE_SITTER.md"
clang -std=c11 -O2 -I"$tree_vendor/runtime/include" -c "$tree_vendor/runtime/src/lib.c" -o "$tree_build/runtime.unprefixed"
clang -std=c11 -O2 -I"$tree_vendor/javascript/src" -c "$tree_vendor/javascript/src/parser.c" -o "$tree_build/javascript-parser.unprefixed"
clang -std=c11 -O2 -I"$tree_vendor/javascript/src" -c "$tree_vendor/javascript/src/scanner.c" -o "$tree_build/javascript-scanner.unprefixed"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$syntax_root/tests/TreeSitterIsolation.test.cpp" \
  "$syntax_root/cpp/TreeSitterHighlighter.cpp" "$tree_build/"*.o "$tree_build/"*.unprefixed -o "$tree_build/isolation-test"
"$tree_build/isolation-test"
if [ "${1:-}" = "--benchmark" ]; then
  bash "$syntax_root/../diff-parser/tests/benchmark-syntax.sh" --benchmark "${@:2}"
elif [ "${1:-}" = "--edit-benchmark" ]; then
  source "$syntax_root/scripts/benchmark-tree-sitter-edits.sh"
fi
echo "Native build/test artifacts: $tree_build"
