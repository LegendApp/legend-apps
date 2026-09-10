#!/usr/bin/env bash
set -euo pipefail
source_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_editor_build="$(mktemp -d "${TMPDIR:-/tmp}/legend-source-editor.XXXXXX")"
trap 'rm -f "$source_editor_build/document-test" "$source_editor_build/layout-test" "$source_editor_build/input-test" "$source_editor_build/syntax-test"; rmdir "$source_editor_build"' EXIT
syntax_parser_dir="$source_editor_dir/../syntax-parser"
source_editor_headers="$source_editor_dir/../../shell/.legend/workspaces/dev/code/macos/Pods/Headers"
syntax_flags=(
  -I"$source_editor_headers/Public" -I"$source_editor_headers/Public/NitroModules"
  -I"$source_editor_headers/Private/NitroModules" -I"$source_editor_headers/Public/React-jsi"
  -I"$source_editor_headers/Public/ReactCommon" -I"$source_editor_headers/Public/React-callinvoker"
  -I"$syntax_parser_dir/vendor/TextMateLib/packages/tml-cpp/build"
)
syntax_sources=(
  "$syntax_parser_dir/cpp/SyntaxHighlighter.cpp" "$syntax_parser_dir/cpp/IncrementalSyntaxHighlighter.cpp"
  "$syntax_parser_dir/vendor/TextMateLib/packages/tml-cpp/build/libtml.a"
  "$syntax_parser_dir/vendor/TextMateLib/packages/tml-cpp/build/oniguruma/lib/libonig.a"
)
clang++ -std=c++20 -O2 -Wall -Wextra -Werror "$source_editor_dir/tests/SourceDocument.test.cpp" -o "$source_editor_build/document-test"
"$source_editor_build/document-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText \
  "$source_editor_dir/tests/SourceLineLayout.test.mm" "$source_editor_dir/macos/SourceLineLayout.mm" -o "$source_editor_build/layout-test"
"$source_editor_build/layout-test"
clang++ -std=c++20 -O2 -fobjc-arc -framework AppKit -framework CoreText "${syntax_flags[@]}" \
  "$source_editor_dir/tests/SourceInputView.test.mm" "$source_editor_dir/macos/SourceInputView.mm" \
  "$source_editor_dir/macos/SourceLineLayout.mm" "${syntax_sources[@]}" -o "$source_editor_build/input-test"
"$source_editor_build/input-test"
clang++ -std=c++20 -O2 -framework CoreFoundation "${syntax_flags[@]}" \
  "$source_editor_dir/tests/IncrementalSyntaxHighlighter.test.cpp" "${syntax_sources[@]}" -o "$source_editor_build/syntax-test"
"$source_editor_build/syntax-test" "$syntax_parser_dir/vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages"
