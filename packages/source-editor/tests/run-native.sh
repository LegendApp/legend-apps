#!/usr/bin/env bash
set -euo pipefail
source_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_editor_build="$(mktemp -d "${TMPDIR:-/tmp}/legend-source-editor.XXXXXX")"
clang++ -std=c++20 -O2 -fobjc-arc -framework Foundation -framework CoreGraphics -framework ImageIO "$source_editor_dir/tests/SourceProgressRing.test.mm" "$source_editor_dir/macos/SourceProgressRing.mm" -o "$source_editor_build/progress-ring-test"
"$source_editor_build/progress-ring-test"
rm "$source_editor_build/progress-ring-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework Foundation "$source_editor_dir/tests/SourceDocumentLoad.test.mm" "$source_editor_dir/macos/SourceDocumentLoad.mm" "$source_editor_dir/macos/SourceFileSession.mm" -o "$source_editor_build/preload-test"
"$source_editor_build/preload-test"
rm "$source_editor_build/preload-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework AppKit "$source_editor_dir/tests/NativeMenuValidation.test.mm" -o "$source_editor_build/menu-test"
"$source_editor_build/menu-test"
rm "$source_editor_build/menu-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework Foundation "$source_editor_dir/tests/SourceFileSession.test.mm" "$source_editor_dir/macos/SourceFileSession.mm" -o "$source_editor_build/file-test"
"$source_editor_build/file-test"
rm "$source_editor_build/file-test"
clang++ -std=c++20 -O2 "$source_editor_dir/tests/SourceEditing.test.cpp" -o "$source_editor_build/editing-test"
"$source_editor_build/editing-test"
rm "$source_editor_build/editing-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework Foundation "$source_editor_dir/tests/SourceSearch.test.mm" "$source_editor_dir/macos/SourceSearch.mm" -o "$source_editor_build/search-test"
"$source_editor_build/search-test"
rm "$source_editor_build/search-test"
trap 'rm -f "$source_editor_build/document-test" "$source_editor_build/layout-test" "$source_editor_build/input-test" "$source_editor_build/syntax-test" "$source_editor_build/reader-test" "$source_editor_build/append-test" "$source_editor_build/scheduling-test" "$source_editor_build/tree-test" "$source_editor_build/theme-test" "$source_editor_build/"*.o; rmdir "$source_editor_build"' EXIT
syntax_parser_dir="$source_editor_dir/../syntax-parser"
tree_vendor="$syntax_parser_dir/vendor/tree-sitter"
node "$syntax_parser_dir/scripts/embed-tree-sitter-queries.ts" --check
node "$syntax_parser_dir/scripts/compile-tree-sitter.ts" "$source_editor_build"
source_editor_headers="$source_editor_dir/../../shell/.legend/workspaces/dev/code/macos/Pods/Headers"
syntax_flags=(
  -I"$source_editor_headers/Public" -I"$source_editor_headers/Public/NitroModules"
  -I"$source_editor_headers/Private/NitroModules" -I"$source_editor_headers/Public/React-jsi"
  -I"$source_editor_headers/Public/ReactCommon" -I"$source_editor_headers/Public/React-callinvoker"
)
syntax_sources=(
  "$source_editor_dir/macos/SourceFileSession.mm"
  "$source_editor_dir/macos/SourceSearch.mm" "$source_editor_dir/macos/SourceSearchPanel.mm"
  "$syntax_parser_dir/cpp/TreeSitterHighlighter.cpp" "$source_editor_build/"*.o
  "$syntax_parser_dir/cpp/SyntaxHighlighter.cpp" "$syntax_parser_dir/cpp/SyntaxTheme.mm"
)
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$source_editor_dir/tests/SourceTreeSyntax.test.cpp" \
  "$syntax_parser_dir/cpp/TreeSitterHighlighter.cpp" "$source_editor_build/"*.o -o "$source_editor_build/tree-test"
"$source_editor_build/tree-test" "$@"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$source_editor_dir/tests/SourceDocument.test.cpp" -o "$source_editor_build/document-test"
"$source_editor_build/document-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$source_editor_dir/tests/SourceFileReader.test.cpp" -o "$source_editor_build/reader-test"
"$source_editor_build/reader-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -Wall -Wextra -Werror "$source_editor_dir/tests/SourceAppend.test.cpp" -o "$source_editor_build/append-test"
"$source_editor_build/append-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText \
  "$source_editor_dir/tests/SourceLineLayout.test.mm" "$source_editor_dir/macos/SourceLineLayout.mm" -o "$source_editor_build/layout-test"
"$source_editor_build/layout-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText "${syntax_flags[@]}" \
  "$source_editor_dir/tests/SourceInputView.test.mm" "$source_editor_dir/macos/SourceInputView.mm" \
  "$source_editor_dir/macos/SourceLineLayout.mm" "${syntax_sources[@]}" -o "$source_editor_build/input-test"
"$source_editor_build/input-test"
clang++ -DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText "${syntax_flags[@]}" \
  "$source_editor_dir/tests/SourceSyntaxScheduling.test.mm" "$source_editor_dir/macos/SourceInputView.mm" \
  "$source_editor_dir/macos/SourceLineLayout.mm" "${syntax_sources[@]}" -o "$source_editor_build/scheduling-test"

"$source_editor_build/scheduling-test" "$@"

clang++ -std=c++20 -O2 -fobjc-arc -framework Foundation "${syntax_flags[@]}" \
  "$syntax_parser_dir/tests/SyntaxTheme.test.mm" -o "$source_editor_build/theme-test"
"$source_editor_build/theme-test" "$syntax_parser_dir/themes"
