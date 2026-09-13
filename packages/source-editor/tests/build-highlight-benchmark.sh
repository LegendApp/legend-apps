#!/usr/bin/env bash
set -euo pipefail
source_editor_root="$(cd "$(dirname "$0")/../../.." && pwd)"
source_editor_output="${1:?Supply a temporary build directory}"
cd "$source_editor_root"
if [[ "${2:-}" != "--reuse-grammars" ]]; then
  node packages/syntax-parser/scripts/compile-tree-sitter.ts "$source_editor_output"
fi
source_editor_headers="$source_editor_root/shell/.legend/workspaces/dev/code/macos/Pods/Headers"
source_editor_flags=(-DLEGEND_SOURCE_HIGHLIGHT_BENCHMARK)
case "${LEGEND_BENCH_PREDICATES:-optimized}" in
  reference) source_editor_flags+=(-DLEGEND_QUERY_REGEX_REFERENCE) ;;
  cache) source_editor_flags+=(-DLEGEND_QUERY_REGEX_CACHE_ONLY) ;;
  optimized) ;;
  *) echo "Expected LEGEND_BENCH_PREDICATES=reference|cache|optimized" >&2; exit 2 ;;
esac
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 "${LEGEND_BENCH_OPT:--O2}" -g -fobjc-arc -framework AppKit -framework CoreText \
  "${source_editor_flags[@]}" \
  -I"$source_editor_headers/Public" -I"$source_editor_headers/Public/NitroModules" \
  -I"$source_editor_headers/Private/NitroModules" -I"$source_editor_headers/Public/React-jsi" \
  -I"$source_editor_headers/Public/ReactCommon" -I"$source_editor_headers/Public/React-callinvoker" \
  packages/source-editor/tests/SourceHighlightBenchmark.mm \
  packages/source-editor/macos/SourceInputView.mm packages/source-editor/macos/SourceLineLayout.mm \
  packages/source-editor/macos/SourceFileSession.mm packages/source-editor/macos/SourceSearch.mm \
  packages/source-editor/macos/SourceSearchPanel.mm packages/syntax-parser/cpp/TreeSitterHighlighter.cpp \
  packages/syntax-parser/cpp/SyntaxHighlighter.cpp packages/syntax-parser/cpp/SyntaxTheme.mm \
  "$source_editor_output/"*.o -o "$source_editor_output/highlight-benchmark"
