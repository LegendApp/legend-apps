#!/usr/bin/env bash
set -euo pipefail
markdown_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
markdown_test_binary="$(mktemp "${TMPDIR:-/tmp}/legend-markdown-selection.XXXXXX")"
trap 'rm -f "$markdown_test_binary"' EXIT
clang++ -std=c++20 -fobjc-arc -framework AppKit \
  "$markdown_editor_dir/ios/LEMarkdownTextSelection.mm" \
  "$markdown_editor_dir/tests/LEMarkdownTextSelection.test.mm" -o "$markdown_test_binary"
"$markdown_test_binary"
