#!/usr/bin/env bash
set -euo pipefail
markdown_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
markdown_test_binary="$(mktemp "${TMPDIR:-/tmp}/legend-markdown-selection.XXXXXX")"
trap 'rm -f "$markdown_test_binary"' EXIT
clang++ -std=c++20 -fobjc-arc -framework AppKit \
  "$markdown_editor_dir/ios/LEMarkdownTextSelection.mm" \
  "$markdown_editor_dir/tests/LEMarkdownTextSelection.test.mm" -o "$markdown_test_binary"
"$markdown_test_binary"

markdown_dependency_dir="$markdown_editor_dir/../markdown-document/node_modules/react-native-enriched-markdown"
markdown_parser_object="$(mktemp "${TMPDIR:-/tmp}/legend-markdown-parser.XXXXXX")"
trap 'rm -f "$markdown_test_binary" "$markdown_parser_object"' EXIT
clang -c "$markdown_dependency_dir/cpp/md4c/md4c.c" -o "$markdown_parser_object"
clang++ -std=c++20 -fobjc-arc -framework Foundation \
  -I"$markdown_dependency_dir/ios/input" -I"$markdown_dependency_dir/cpp/md4c" \
  "$markdown_dependency_dir/ios/input/ENRMInputParser.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputRemend.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputStyledRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMFormattingRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMBlockRange.mm" \
  "$markdown_editor_dir/tests/MarkdownPasteSelection.test.mm" \
  "$markdown_parser_object" -o "$markdown_test_binary"
"$markdown_test_binary"
