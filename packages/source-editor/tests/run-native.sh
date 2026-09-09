#!/usr/bin/env bash
set -euo pipefail
source_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_editor_build="$(mktemp -d "${TMPDIR:-/tmp}/legend-source-editor.XXXXXX")"
trap 'rm -f "$source_editor_build/document-test" "$source_editor_build/layout-test" "$source_editor_build/input-test"; rmdir "$source_editor_build"' EXIT
clang++ -std=c++20 -O2 -Wall -Wextra -Werror "$source_editor_dir/tests/SourceDocument.test.cpp" -o "$source_editor_build/document-test"
"$source_editor_build/document-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText \
  "$source_editor_dir/tests/SourceLineLayout.test.mm" "$source_editor_dir/macos/SourceLineLayout.mm" -o "$source_editor_build/layout-test"
"$source_editor_build/layout-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText \
  "$source_editor_dir/tests/SourceInputView.test.mm" "$source_editor_dir/macos/SourceInputView.mm" \
  "$source_editor_dir/macos/SourceLineLayout.mm" -o "$source_editor_build/input-test"
"$source_editor_build/input-test"
