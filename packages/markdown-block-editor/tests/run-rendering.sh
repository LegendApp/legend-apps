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
(out/'InputPreDraw.inc').write_text(extract(source, '- (void)viewWillDraw') if '- (void)viewWillDraw' in source else '')
source = (b/'ios/input/EnrichedMarkdownTextInput.mm').read_text()
(out/'InputRefresh.inc').write_text(extract((b/'ios/utils/ENRMUIKit.h').read_text(), 'static inline void ENRMRefreshTextViewLayout'))
(out/'InputLayout.inc').write_text('\n'.join(extract(source, method) for method in [
    '- (void)applyTextViewLayout', '- (void)scheduleRelayoutIfNeeded', '- (void)_performRelayout', '- (CGSize)measureSize']))
(out/'ImageActivation.inc').write_text(extract((editor/'ios/RNMarkdownBlockEditor.mm').read_text(), '- (nullable NSView *)hitTest:'))
(out/'TextHitTest.inc').write_text((b/'ios/utils/ENRMTextHitTest.m').read_text().replace('#import "ENRMTextHitTest.h"', ''))
PY
clang++ -x objective-c++ -std=c++20 -fobjc-arc -framework AppKit -DENRICHED_MARKDOWN_MATH=1 -DENRICHED_MARKDOWN_VIDEO=1 \
  -I"$markdown_rendering_dir" -I"$markdown_dependency_dir/ios/utils" -I"$markdown_dependency_dir/ios/parser" -I"$markdown_dependency_dir/ios/segments" \
  "$markdown_dependency_dir/ios/parser/MarkdownASTNode.m" \
  "$markdown_dependency_dir/ios/segments/RenderedMarkdownSegment.m" \
  "$markdown_editor_dir/tests/MarkdownRendering.test.mm" -o "$markdown_rendering_dir/test"
"$markdown_rendering_dir/test"
