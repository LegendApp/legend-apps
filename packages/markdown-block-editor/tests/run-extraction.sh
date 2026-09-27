#!/usr/bin/env bash
set -euo pipefail
markdown_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
markdown_dependency_dir="$markdown_editor_dir/../markdown-document/node_modules/react-native-enriched-markdown"
markdown_extraction_dir="$(mktemp -d "${TMPDIR:-/tmp}/legend-markdown-extraction.XXXXXX")"
trap 'rm -rf "$markdown_extraction_dir"' EXIT
# Compile the real extractor with lightweight declarations for unrelated rendering dependencies.
cp "$markdown_dependency_dir/ios/utils/MarkdownExtractor.m" "$markdown_dependency_dir/ios/utils/MarkdownExtractor.h" "$markdown_extraction_dir/"
cp "$markdown_dependency_dir/ios/renderer/BaselineShiftTextAttributes.h" "$markdown_extraction_dir/"
cat > "$markdown_extraction_dir/ENRMUIKit.h" <<'HEADER'
#pragma once
#import <AppKit/AppKit.h>
#define UIFont NSFont
#define UIFontDescriptorSymbolicTraits NSFontDescriptorSymbolicTraits
#define UIFontDescriptorTraitBold NSFontDescriptorTraitBold
#define UIFontDescriptorTraitItalic NSFontDescriptorTraitItalic
HEADER
cat > "$markdown_extraction_dir/ExtractionStubs.h" <<'HEADER'
#pragma once
#import <AppKit/AppKit.h>
#define ENRICHED_MARKDOWN_MATH 0
static NSString *const BlockquoteDepthAttributeName = @"BlockquoteDepth";
static NSString *const HighlightAttributeName = @"Highlight";
static NSString *const CodeBlockAttributeName = @"CodeBlock";
extern NSString *const MarkdownTypeAttributeName;
extern NSString *const ListDepthAttribute;
extern NSString *const ListTypeAttribute;
extern NSString *const ListItemNumberAttribute;
extern NSString *const TaskItemAttribute;
extern NSString *const TaskCheckedAttribute;
@interface ENRMImageAttachment : NSTextAttachment
@property NSString *imageURL;
@property BOOL isInline;
@end
@interface ThematicBreakAttachment : NSTextAttachment
@end
HEADER
for header in BlockquoteBorder ENRMFeatureFlags ENRMImageAttachment HighlightRenderer LastElementUtils ListItemRenderer RuntimeKeys ThematicBreakAttachment; do
  echo '#import "ExtractionStubs.h"' > "$markdown_extraction_dir/$header.h"
done
clang -fobjc-arc -framework AppKit -I"$markdown_extraction_dir" \
  "$markdown_extraction_dir/MarkdownExtractor.m" "$markdown_editor_dir/tests/MarkdownExtraction.test.m" \
  -o "$markdown_extraction_dir/test"
"$markdown_extraction_dir/test"
