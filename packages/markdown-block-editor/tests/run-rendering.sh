#!/usr/bin/env bash
set -euo pipefail
markdown_editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
markdown_dependency_dir="$markdown_editor_dir/../markdown-document/node_modules/react-native-enriched-markdown"
markdown_rendering_dir="$(mktemp -d "${TMPDIR:-/tmp}/markdown-rendering.XXXXXX")"
trap 'rm -rf "$markdown_rendering_dir"' EXIT
# Exercise the real native functions with AppKit, without React's generated headers.
python3 - "$markdown_dependency_dir" "$markdown_editor_dir" "$markdown_rendering_dir" <<'PY'
from pathlib import Path
import sys
b, editor, out = map(Path, sys.argv[1:])
def extract(source, start):
    i = source.index(start)
    opening = source.index('{', i)
    depth = 1
    end = opening + 1
    while depth:
        if source[end] == '{': depth += 1
        if source[end] == '}': depth -= 1
        end += 1
    return source[i:end]
(out/'SplitSegments.inc').write_text(extract((b/'ios/segments/SegmentRenderer.m').read_text(), 'static NSArray *ENRMSplitASTIntoSegments'))
source = (b/'ios/input/ENRMInputTextView.mm').read_text()
# Include any display override so regressions cannot hide behind the test host.
(out/'InputPreDraw.inc').write_text((extract(source[source.index('#else // TARGET_OS_OSX'):], '- (BOOL)allowsVibrancy') if '- (BOOL)allowsVibrancy' in source else '') + (extract(source, '- (void)viewWillDraw') if '- (void)viewWillDraw' in source else ''))
source = (b/'ios/input/EnrichedMarkdownTextInput.mm').read_text()
(out/'InputWidth.inc').write_text(next(line for line in source.splitlines() if '_textView.textContainer.widthTracksTextView =' in line))
(out/'InputRefresh.inc').write_text(extract((b/'ios/utils/ENRMUIKit.h').read_text(), 'static inline void ENRMRefreshTextViewLayout'))
(out/'InputLayout.inc').write_text('\n'.join(extract(source, method) for method in [
    '- (void)applyTextViewLayout', '- (void)scheduleRelayoutIfNeeded', '- (void)_performRelayout', '- (CGSize)measureSize']))
(out/'InputImport.inc').write_text('\n'.join(extract(source, method) for method in [
    '- (void)importMarkdown:', '- (void)applyFormatting\n', '- (void)applyFormattingScopedToRange:',
    '- (void)setValue:', '- (void)setValuePreservingSelection:']))
session = (b/'ios/input/ENRMEditSession.mm').read_text()
(out/'InputDeletion.inc').write_text(extract(source, '- (nullable NSString *)textInputShouldChangeText:'))
(out/'InputSelection.inc').write_text(extract(source, '- (void)textInputDidChangeSelection'))
(out/'InputShortcut.inc').write_text(extract(source, '- (BOOL)applyMarkdownShortcutForEditAtLocation:'))
(out/'InputSession.inc').write_text('\n'.join(extract(session, method) for method in [
    '- (void)enterPhase:', '- (void)exitPhase', '- (BOOL)shouldSuppressFormatting']))
(out/'ImageActivation.inc').write_text(extract((editor/'ios/RNMarkdownBlockEditor.mm').read_text(), '- (nullable NSView *)hitTest:'))
(out/'ImageLayoutNotification.inc').write_text(extract((b/'ios/attachments/ENRMImageAttachment.m').read_text(), '- (void)notifyImageLayoutObserver:').replace('UITextView *', 'ImageLayoutHost *'))
(out/'HeadingBaseline.inc').write_text('#undef ENRICHED_MARKDOWN_MATH\n#define ENRICHED_MARKDOWN_MATH 0\n' + extract((b/'ios/utils/ParagraphStyleUtils.m').read_text(), 'void applyBaselineOffset(') + '\n' + extract((b/'ios/input/ENRMInputMeasurementStyle.h').read_text(), 'static inline void ENRMApplyInputParagraphBaselineOffset('))
for kind in ['Unordered', 'Ordered']:
    (out/f'{kind}ListStyle.inc').write_text(extract((b/f'ios/input/styles/ENRM{kind}ListBlockHandler.mm').read_text(), '- (void)applyAttributesToParagraphStyle:'))
link = (b/'ios/input/styles/ENRMLinkStyleHandler.mm').read_text()
(out/'LinkStyle.inc').write_text(extract(link, 'static ENRMInputLinkVariantStyle *ENRMResolveInputLinkVariant(') + '\n@implementation LinkStyleProbe\n' + extract(link, '- (void)applyNonFontAttributesToTextStorage:') + '\n@end\n')
(out/'TaskHitTest.inc').write_text('\n'.join(extract((b/'ios/utils/TaskListTapUtils.m').read_text(), method) for method in ['NSRange taskListItemFullRange(', 'TaskListHitTestResult taskListHitTestAtPoint(']))
(out/'InteractiveHitTest.inc').write_text(extract((b/'ios/utils/LinkTapUtils.m').read_text(), 'BOOL isPointOnInteractiveElement('))
(out/'TextHitTest.inc').write_text((b/'ios/utils/ENRMTextHitTest.m').read_text().replace('#import "ENRMTextHitTest.h"', ''))
(out/'React').mkdir()
(out/'React/RCTLog.h').write_text('#define RCTLogError(...) NSLog(__VA_ARGS__)\n')
PY
clang -c "$markdown_dependency_dir/cpp/md4c/md4c.c" -o "$markdown_rendering_dir/parser.o"
clang++ -x objective-c++ -std=c++20 -fobjc-arc -framework AppKit -DENRICHED_MARKDOWN_MATH=1 -DENRICHED_MARKDOWN_VIDEO=1 \
  -I"$(xcrun --show-sdk-path)/usr/include/libxml2" -I"$markdown_dependency_dir/cpp/parser" \
  -I"$markdown_rendering_dir" -I"$markdown_dependency_dir/ios/utils" -I"$markdown_dependency_dir/ios/parser" -I"$markdown_dependency_dir/ios/segments" \
  -I"$markdown_dependency_dir/ios/input" -I"$markdown_dependency_dir/cpp/md4c" \
  "$markdown_dependency_dir/ios/input/ENRMInputParser.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputRemend.mm" \
  "$markdown_dependency_dir/ios/input/ENRMMarkdownSerializer.mm" \
  "$markdown_dependency_dir/ios/input/ENRMInputStyledRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMFormattingRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMBlockRange.mm" \
  "$markdown_dependency_dir/ios/input/ENRMBlockStore.mm" \
  "$markdown_dependency_dir/ios/input/ENRMBlockEditCoordinator.mm" \
  "$markdown_dependency_dir/ios/input/ENRMRangeEditAdjustment.mm" \
  "$markdown_dependency_dir/ios/input/ENRMMarkdownShortcutMatcher.mm" \
  "$markdown_dependency_dir/ios/parser/MarkdownASTNode.m" \
  "$markdown_dependency_dir/cpp/parser/MD4CParser.cpp" \
  "$markdown_dependency_dir/ios/parser/MarkdownParserBridge.mm" \
  "$markdown_dependency_dir/ios/parser/ENRMMarkdownParser.mm" \
  "$markdown_dependency_dir/ios/segments/RenderedMarkdownSegment.m" \
  "$markdown_editor_dir/tests/MarkdownRendering.test.mm" -lxml2 -x none "$markdown_rendering_dir/parser.o" -o "$markdown_rendering_dir/test"
"$markdown_rendering_dir/test"
