#import "SourceSearchPanel.h"
#import "SourceInputView.h"
#import "SourceSearch.h"
#include <atomic>
#include <memory>

@interface LESourceSearchPanel () <NSSearchFieldDelegate, NSWindowDelegate>
@end
@implementation LESourceSearchPanel {
  __weak LESourceInputView *_input;
  NSPanel *_panel;
  NSSearchField *_query;
  NSTextField *_replacement, *_status;
  NSButton *_regex, *_caseSensitive, *_wholeWord;
  LESourceSearchResult *_result;
  NSString *_snapshot;
  uint64_t _revision;
  NSInteger _selected;
  std::shared_ptr<std::atomic_bool> _cancelled;
}
- (NSButton *)button:(NSString *)title action:(SEL)action {
  return [NSButton buttonWithTitle:title target:self action:action];
}
- (instancetype)initWithInput:(LESourceInputView *)input {
  if ((self = [super init])) {
    _input = input;
    _panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, 650, 150) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
    _panel.title = @"Find and Replace"; _panel.releasedWhenClosed = NO; _panel.delegate = self;
    _query = [[NSSearchField alloc] initWithFrame:NSZeroRect]; _query.placeholderString = @"Find"; _query.delegate = self;
    _replacement = [[NSTextField alloc] initWithFrame:NSZeroRect]; _replacement.placeholderString = @"Replace with";
    _regex = [NSButton checkboxWithTitle:@"Regex" target:self action:@selector(refresh:)];
    _caseSensitive = [NSButton checkboxWithTitle:@"Match case" target:self action:@selector(refresh:)];
    _wholeWord = [NSButton checkboxWithTitle:@"Whole word" target:self action:@selector(refresh:)];
    _status = [NSTextField labelWithString:@""];
    NSStackView *row1 = [NSStackView stackViewWithViews:@[_query, [self button:@"Previous" action:@selector(previous:)], [self button:@"Next" action:@selector(next:)]]];
    NSStackView *row2 = [NSStackView stackViewWithViews:@[_replacement, [self button:@"Replace" action:@selector(replace:)], [self button:@"Replace All" action:@selector(replaceAll:)]]];
    NSStackView *row3 = [NSStackView stackViewWithViews:@[_regex, _caseSensitive, _wholeWord, _status]];
    NSStackView *stack = [NSStackView stackViewWithViews:@[row1, row2, row3]];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical; stack.alignment = NSLayoutAttributeLeading; stack.spacing = 8;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [_panel.contentView addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
      [stack.leadingAnchor constraintEqualToAnchor:_panel.contentView.leadingAnchor constant:12],
      [stack.trailingAnchor constraintEqualToAnchor:_panel.contentView.trailingAnchor constant:-12],
      [stack.topAnchor constraintEqualToAnchor:_panel.contentView.topAnchor constant:12],
      [_query.widthAnchor constraintEqualToConstant:400], [_replacement.widthAnchor constraintEqualToConstant:400],
    ]];
  }
  return self;
}
- (void)show {
  if (!_panel.visible) { [_panel center]; [_input.window addChildWindow:_panel ordered:NSWindowAbove]; }
  [_panel makeKeyAndOrderFront:nil]; [_panel makeFirstResponder:_query]; [self refresh:nil];
}
- (void)close { if (_cancelled) *_cancelled = true; [_panel.parentWindow removeChildWindow:_panel]; [_panel close]; }
- (void)windowWillClose:(NSNotification *)notification {
  if (_cancelled) *_cancelled = true;
  _result = nil; _snapshot = nil;
  [_panel.parentWindow removeChildWindow:_panel];
}
- (void)dealloc { if (_cancelled) *_cancelled = true; _panel.delegate = nil; [_panel close]; }
- (void)invalidate {
  if (_cancelled) *_cancelled = true;
  _result = nil; _snapshot = nil;
  if (!_panel.visible) return;
  _status.stringValue = @"Searching…";
  _cancelled = std::make_shared<std::atomic_bool>(false);
  const auto cancellation = _cancelled;
  __weak LESourceSearchPanel *weakSelf = self;
  // AppKit can deliver accessibility edits without a running default-mode timer
  // loop. Keep debounce delivery on the main queue, independent of run-loop mode.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 150 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
    if (!cancellation->load()) [weakSelf refresh:nil];
  });
}
- (void)controlTextDidChange:(NSNotification *)notification { [self invalidate]; }
- (void)refresh:(id)sender {
  if (_cancelled) *_cancelled = true;
  _cancelled = std::make_shared<std::atomic_bool>(false);
  const auto cancellation = _cancelled;
  _result = nil; _snapshot = nil; _selected = -1;
  if (!_input || _input.sourceLoading) { _status.stringValue = @"Wait for loading to finish"; return; }
  if (!_query.stringValue.length) { _status.stringValue = @""; return; }
  _status.stringValue = @"Searching…";
  NSString *query = [_query.stringValue copy];
  const BOOL regex = _regex.state == NSControlStateValueOn, sensitive = _caseSensitive.state == NSControlStateValueOn, word = _wholeWord.state == NSControlStateValueOn;
  _revision = _input.documentRevision;
  const auto revision = _revision;
  const auto start = _input.selectedRange.location;
  __weak LESourceSearchPanel *weakSelf = self;
  [_input copySourceWithCompletion:^(NSString *source, NSString *error) {
    if (cancellation->load()) return;
    if (!source) { LESourceSearchPanel *self = weakSelf; if (self) self->_status.stringValue = error; return; }
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSError *failure = nil;
      auto *result = LESearchSource(source, query, regex, sensitive, word, ^BOOL { return cancellation->load(); }, &failure);
      dispatch_async(dispatch_get_main_queue(), ^{
        LESourceSearchPanel *self = weakSelf;
        if (!self || cancellation->load() || self->_input.documentRevision != revision) return;
        self->_snapshot = source; self->_result = result;
        self->_status.stringValue = failure ? failure.localizedDescription : [NSString stringWithFormat:@"%lu%@ matches", result.matches.count, result.truncated ? @"+" : @""];
        if (result.matches.count) {
          self->_selected = 0;
          for (NSUInteger i = 0; i < result.matches.count; ++i) {
            if (result.matches[i].range.location >= start) { self->_selected = i; break; }
          }
          [self selectMatch];
        }
      });
    });
  }];
}
- (BOOL)current { return _result && _input && _revision == _input.documentRevision; }
- (void)selectMatch {
  if (![self current] || _selected < 0 || _selected >= (NSInteger)_result.matches.count) return;
  [_input setAccessibilitySelectedTextRange:_result.matches[_selected].range];
  _status.stringValue = [NSString stringWithFormat:@"%ld / %lu%@", _selected + 1, _result.matches.count, _result.truncated ? @"+" : @""];
}
- (void)next:(id)sender { if (![self current] || !_result.matches.count) return; _selected = (_selected + 1) % _result.matches.count; [self selectMatch]; }
- (void)previous:(id)sender { if (![self current] || !_result.matches.count) return; _selected = (_selected <= 0 ? _result.matches.count : _selected) - 1; [self selectMatch]; }
- (NSString *)replacementFor:(NSTextCheckingResult *)match {
  return _regex.state == NSControlStateValueOn ? [_result.expression replacementStringForResult:match inString:_snapshot offset:0 template:_replacement.stringValue] : _replacement.stringValue;
}
- (void)replace:(id)sender {
  if (![self current] || _selected < 0) return;
  NSTextCheckingResult *match = _result.matches[_selected];
  NSString *replacement = [self replacementFor:match];
  [_input setAccessibilitySelectedTextRange:match.range];
  [_input replaceSelectionWithText:replacement];
}
- (void)replaceAll:(id)sender {
  if (![self current] || !_result.matches.count) return;
  if (_result.truncated) { _status.stringValue = @"Too many matches; narrow the search before replacing all."; return; }
  // Build on a worker, then atomically apply only to the searched revision.
  NSString *source = _snapshot, *replacement = [_replacement.stringValue copy];
  LESourceSearchResult *result = _result;
  const BOOL regex = _regex.state == NSControlStateValueOn;
  const auto revision = _revision;
  const auto cancellation = _cancelled;
  __weak LESourceSearchPanel *weakSelf = self;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSMutableString *text = [NSMutableString new]; NSUInteger offset = 0;
    for (NSTextCheckingResult *match in result.matches) {
      if (cancellation->load()) return;
      [text appendString:[source substringWithRange:NSMakeRange(offset, match.range.location - offset)]];
      [text appendString:regex ? [result.expression replacementStringForResult:match inString:source offset:0 template:replacement] : replacement];
      offset = NSMaxRange(match.range);
    }
    [text appendString:[source substringFromIndex:offset]];
    dispatch_async(dispatch_get_main_queue(), ^{
      LESourceSearchPanel *self = weakSelf;
      if (!self || cancellation->load() || self->_input.documentRevision != revision) return;
      [self->_input setAccessibilitySelectedTextRange:NSMakeRange(0, source.length)];
      [self->_input replaceSelectionWithText:text];
    });
  });
}
@end
