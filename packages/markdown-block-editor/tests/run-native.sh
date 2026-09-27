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

clang -fobjc-arc -framework AppKit \
  -I"$markdown_dependency_dir/ios/utils" \
  "$markdown_dependency_dir/ios/utils/ENRMCodeBlockLineLayout.m" \
  "$markdown_editor_dir/tests/MarkdownCodeBlockLayout.test.m" -o "$markdown_test_binary"
"$markdown_test_binary"

clang -fobjc-arc -framework AppKit \
  -I"$markdown_dependency_dir/ios/utils" \
  "$markdown_editor_dir/tests/MarkdownInputLayout.test.m" -o "$markdown_test_binary"
"$markdown_test_binary"

# Compile the real detector with a minimal style declaration: these tests exercise
# detection and serialization, without requiring React's generated prop headers.
markdown_detector_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/legend-markdown-autolink.XXXXXX")"
trap 'rm -f "$markdown_test_binary" "$markdown_parser_object"; rm -rf "$markdown_detector_test_dir"' EXIT
cp "$markdown_dependency_dir/ios/input/ENRMAutoLinkDetector.mm" "$markdown_detector_test_dir/"
cat > "$markdown_detector_test_dir/InputStylePropsUtils.h" <<'STYLE'
#import <AppKit/AppKit.h>
@interface ENRMInputFormatterStyle : NSObject
@property (nonatomic, strong) NSColor *linkColor;
@property (nonatomic) BOOL linkUnderline;
@end
STYLE
clang++ -std=c++20 -fobjc-arc -framework AppKit -include AppKit/AppKit.h \
  -Wno-nonnull -I"$markdown_dependency_dir/ios/input" -I"$markdown_dependency_dir/cpp/md4c" \
  "$markdown_detector_test_dir/ENRMAutoLinkDetector.mm" \
  "$markdown_dependency_dir/ios/input/ENRMDetectorPipeline.mm" \
  "$markdown_dependency_dir/ios/input/ENRMWordsUtils.mm" \
  "$markdown_dependency_dir/ios/input/ENRMFormattingStore.mm" \
  "$markdown_dependency_dir/ios/input/ENRMRangeEditAdjustment.mm" \
  "$markdown_dependency_dir/ios/input/ENRMFormattingRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMMarkdownSerializer.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputParser.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputRemend.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputStyledRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMBlockRange.mm" \
  "$markdown_editor_dir/tests/MarkdownAutoLinkCode.test.mm" \
  "$markdown_parser_object" -o "$markdown_test_binary"
"$markdown_test_binary"

clang++ -std=c++20 -fobjc-arc -framework AppKit \
  "$markdown_editor_dir/ios/LEMarkdownKeyboardHandoff.mm" \
  "$markdown_editor_dir/tests/MarkdownKeyboardHandoff.test.mm" -o "$markdown_test_binary"
"$markdown_test_binary"

clang++ -std=c++20 -fobjc-arc -framework Foundation \
  "$markdown_editor_dir/tests/MarkdownListExit.test.mm" -o "$markdown_test_binary"
"$markdown_test_binary"

clang++ -std=c++20 -fobjc-arc -framework AppKit \
  "$markdown_editor_dir/tests/MarkdownHistoryKey.test.mm" -o "$markdown_test_binary"
"$markdown_test_binary"

# Copy/selection must preserve semantic formatting, not paragraph baseline styling.
bash "$markdown_editor_dir/tests/run-extraction.sh"
bash "$markdown_editor_dir/tests/run-activation-lifecycle.sh"
