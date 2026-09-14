#import "SourceInputView.h"
#include "../cpp/SourceEditing.hpp"
#import "SourceSearchPanel.h"
#include "../cpp/SourceDocument.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"
#include "../cpp/SourceTreeSyntax.hpp"
#include <unordered_set>
#include <map>

using legend::source::SourceDocument;
namespace syntax = margelo::nitro::legendapps::syntaxparser;

static std::u16string utf16(NSString *text) {
  std::u16string result(text.length, 0);
  [text getCharacters:reinterpret_cast<unichar *>(result.data()) range:NSMakeRange(0, text.length)];
  return result;
}
static NSString *string(const std::u16string &text) {
  return [[NSString alloc] initWithCharacters:reinterpret_cast<const unichar *>(text.data()) length:text.size()];
}

@interface LESourceInputView ()
- (void)publishSelection;
- (void)replaceRange:(NSRange)range text:(NSString *)text recordUndo:(BOOL)recordUndo;
- (void)revealSelectionInRow:(LESourceRowView *)row;
- (void)resetSyntax;
- (void)retireSyntax;
- (void)scheduleSyntax;
- (void)scheduleTreeSyntax;
- (void)refreshTreePalette;
- (std::vector<syntax::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme;
- (LESourceLineLayout *)layoutForLine:(NSUInteger)index referenceRow:(nullable LESourceRowView *)row;
- (void)applySyntaxToText:(NSMutableAttributedString *)text line:(NSUInteger)index font:(NSFont *)font;
- (void)selectionDragTick;
@end

@implementation LESourceInputView {
  std::shared_ptr<SourceDocument> _document;
  NSHashTable<LESourceRowView *> *_rows;
  NSRange _marked;
  NSUndoManager *_history;
  CGFloat _preferredX;
  NSString *_compositionOriginal;
  NSRange _compositionRange;
  uint64_t _compositionState;
  BOOL _needsSelectionReveal;
  NSString *_syntaxLanguage, *_syntaxTheme;
  BOOL _syntaxEnabled;
  NSDictionary *_layoutAttributes;
  CGFloat _layoutWidth, _layoutLineHeight;
  BOOL _layoutWrap;
  __weak NSScrollView *_dragScrollView;
  NSTimer *_dragTimer;
  id _dragMonitor, _dragWindowObserver;
  NSPoint _dragPoint;
  BOOL _dragActive, _dragMoved;
  BOOL _startupDrawn;
  uint64_t _editState, _savedState, _nextEditState;
  BOOL _saving, _savePanelVisible;
  LESourceSearchPanel *_searchPanel;
  std::map<NSUInteger, unichar> _pairedClosers;
  NSTimeInterval _lastProgressAt;
  BOOL _lastProgressActive;
  NSUInteger _lastProgressTotal;
  std::shared_ptr<legend::source::SourceTreeSyntax> _treeSyntax;
  dispatch_queue_t _treeQueue;
  std::unordered_map<uint64_t, std::vector<legend::source::SourceSyntaxToken>> _treeRows;
  std::vector<std::string> _treeCaptures;
  NSArray<NSColor *> *_treeColors;
  std::vector<int> _treeFontStyles;
  NSUInteger _treeCopiedUnits, _treeNextLine, _treeRevision, _treeVisibleRevision, _treeVisibleStart, _treeVisibleEnd;
  NSUInteger _treeKnownEnd, _treeDirtyEnd;
  BOOL _treeBusy, _treePrefixDone, _treeParsePending;
  std::shared_ptr<std::atomic_bool> _treeJobCancellation;
  std::unordered_set<std::string> _requestedGrammarNames;
}
- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _rows = [NSHashTable weakObjectsHashTable];
    _history = [NSUndoManager new];
    _indentUnit = @"  ";
    _automaticPairs = YES;
    [self loadSource:@""];
  }
  return self;
}
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstResponder { return YES; }
- (BOOL)resignFirstResponder { [self endSelectionDrag]; return [super resignFirstResponder]; }
- (void)viewDidMoveToWindow { [super viewDidMoveToWindow]; [self endSelectionDrag]; }
- (void)dealloc {
  [_searchPanel close];
  [self retireSyntax];
  auto retired = std::move(_document);
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ (void)retired; });
  [_dragTimer invalidate];
  if (_dragMonitor) [NSEvent removeMonitor:_dragMonitor];
  if (_dragWindowObserver) [NSNotificationCenter.defaultCenter removeObserver:_dragWindowObserver];
}
- (NSView *)hitTest:(NSPoint)point { return nil; } // rows handle pointing; this view owns keyboard focus
- (NSUndoManager *)undoManager { return _history; }
- (BOOL)isAccessibilityElement { return YES; }
- (NSString *)accessibilityRole { return NSAccessibilityTextAreaRole; }
- (NSString *)accessibilityLabel { return @"Source editor"; }
- (BOOL)isAccessibilityEnabled { return YES; }
- (BOOL)isAccessibilityFocused { return self.window.firstResponder == self; }
- (void)setAccessibilityFocused:(BOOL)focused { if (focused) [self.window makeFirstResponder:self]; }
- (id)accessibilityValue { return self.source; }
- (NSInteger)accessibilityNumberOfCharacters { return _document->length(); }
- (NSRange)accessibilitySelectedTextRange { return self.selectedRange; }
- (void)setAccessibilitySelectedTextRange:(NSRange)range {
  [self unmarkText];
  _anchor = MIN(range.location, _document->length());
  _head = _anchor + MIN(range.length, _document->length() - _anchor);
  _preferredX = NAN;
  [self publishSelection];
}
- (NSString *)accessibilitySelectedText { return string(_document->slice(self.selectedRange.location, self.selectedRange.length)); }
- (void)setAccessibilitySelectedText:(NSString *)text { [self insertText:text replacementRange:self.selectedRange]; }
- (void)setAccessibilityValue:(id)value {
  if ([value isKindOfClass:NSString.class]) [self insertText:value replacementRange:NSMakeRange(0, _document->length())];
}
- (void)loadSource:(NSString *)source {
  [self adoptDocument:std::make_shared<SourceDocument>(utf16(source))];
}
- (NSUInteger)lineCount { return _document->lineCount(); }
- (BOOL)dirty { return _editState != _savedState; }
- (uint64_t)documentRevision { return _document->revision(); }
- (void)showFindPanel {
  if (!_searchPanel) _searchPanel = [[LESourceSearchPanel alloc] initWithInput:self];
  [_searchPanel show];
}
- (void)showGoToLine {
  NSAlert *alert = [NSAlert new]; alert.messageText = @"Go to Line";
  NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 220, 24)];
  field.stringValue = [NSString stringWithFormat:@"%lu", _document->position(_head).line + 1];
  alert.accessoryView = field;
  [alert addButtonWithTitle:@"Go"]; [alert addButtonWithTitle:@"Cancel"];
  [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
    if (result == NSAlertFirstButtonReturn && field.integerValue > 0) { [self selectLine:field.integerValue - 1]; [self.window makeFirstResponder:self]; }
  }];
  [alert.window makeFirstResponder:field];
}
- (void)publishDocumentState {
  if (self.fileSession) self.window.documentEdited = self.dirty;
  if (self.onDocumentState) self.onDocumentState(self.dirty, self.fileSession.path ?: @"");
}
- (void)copySourceChunk:(NSMutableString *)source offset:(NSUInteger)offset document:(std::shared_ptr<SourceDocument>)document revision:(uint64_t)revision completion:(void (^)(NSString *, NSString *))completion {
  if (_document != document || _document->revision() != revision) { completion(nil, @"The document changed. Please try again."); return; }
  const auto count = MIN((NSUInteger)65536, _document->length() - offset);
  [source appendString:string(_document->slice(offset, count))];
  if (offset + count == _document->length()) { completion(source, nil); return; }
  dispatch_async(dispatch_get_main_queue(), ^{ [self copySourceChunk:source offset:offset + count document:document revision:revision completion:completion]; });
}
- (void)copySourceWithCompletion:(void (^)(NSString *, NSString *))completion {
  [self copySourceChunk:[NSMutableString new] offset:0 document:_document revision:_document->revision() completion:completion];
}
- (void)saveToPath:(NSString *)path completion:(void (^)(BOOL, NSString *))completion {
  [self unmarkText];
  if (_saving || !self.fileReadComplete || !self.fileSession) { completion(NO, @"Wait until the file finishes loading or saving."); return; }
  _saving = YES;
  const auto state = _editState;
  const auto document = _document;
  LESourceFileSession *session = self.fileSession;
  [self copySourceWithCompletion:^(NSString *source, NSString *error) {
    if (!source) { self->_saving = NO; completion(NO, error); return; }
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSError *failure = nil;
      const BOOL saved = [session writeSource:source toPath:path error:&failure];
      dispatch_async(dispatch_get_main_queue(), ^{
        self->_saving = NO;
        if (saved && self->_document == document) {
          self->_savedState = state;
          self.window.representedURL = [NSURL fileURLWithPath:session.path];
          [self publishDocumentState];
        }
        completion(saved, failure.localizedDescription ?: @"");
      });
    });
  }];
}
- (void)saveAs:(BOOL)saveAs completion:(void (^)(BOOL, NSString *))completion {
  if (_saving || _savePanelVisible) { completion(NO, @"Wait until saving finishes."); return; }
  if (!saveAs) { [self saveToPath:self.fileSession.path completion:completion]; return; }
  _savePanelVisible = YES;
  NSSavePanel *panel = [NSSavePanel savePanel];
  panel.nameFieldStringValue = self.fileSession.path.lastPathComponent ?: @"Untitled.txt";
  panel.directoryURL = [NSURL fileURLWithPath:self.fileSession.path.stringByDeletingLastPathComponent ?: NSTemporaryDirectory()];
  [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
    self->_savePanelVisible = NO;
    if (result != NSModalResponseOK) { completion(NO, @""); return; }
    [self saveToPath:panel.URL.path completion:completion];
  }];
}
- (void)confirmDiscardWithCompletion:(void (^)(BOOL))completion {
  [self unmarkText];
  if (_saving || _savePanelVisible) { completion(NO); return; }
  if (!self.dirty) { completion(YES); return; }
  NSAlert *alert = [NSAlert new];
  alert.messageText = @"Save your changes?";
  alert.informativeText = @"Your changes will be lost if you don't save them.";
  [alert addButtonWithTitle:@"Save"]; [alert addButtonWithTitle:@"Cancel"]; [alert addButtonWithTitle:@"Don't Save"];
  [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
    if (result == NSAlertThirdButtonReturn) completion(YES);
    else if (result == NSAlertFirstButtonReturn) [self saveAs:NO completion:^(BOOL saved, NSString *error) {
      if (error.length) { NSAlert *failure = [NSAlert new]; failure.messageText = error; [failure beginSheetModalForWindow:self.window completionHandler:nil]; }
      completion(saved && !self.dirty);
    }];
    else completion(NO);
  }];
}
- (void)adoptDocument:(std::shared_ptr<SourceDocument>)document {
  _pairedClosers.clear();
  [_searchPanel close]; _searchPanel = nil;
  _editState = _savedState = 0; _nextEditState = 1;
  if (self.fileSession) self.window.documentEdited = NO;
  _startupDrawn = NO;
  [self endSelectionDrag];
  _layoutAttributes = nil;
  auto retired = std::move(_document);
  _document = std::move(document);
  // Releasing a large previous file must not pause a newly opened file.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ (void)retired; });
  _anchor = _head = 0;
  _marked = NSMakeRange(NSNotFound, 0);
  _compositionOriginal = nil;
  _preferredX = NAN;
  _needsSelectionReveal = NO;
  [_history removeAllActions];
  for (LESourceRowView *row in _rows) [row invalidateText];
  [self resetSyntax];
}
- (NSDictionary *)appendDocument:(SourceDocument &&)chunk {
  auto change = _document->appendLoaded(std::move(chunk));
  const auto start = change.fallback ? change.fallback->startLine : change.startLine;
  if (_treeSyntax) { ++_treeRevision; _treeNextLine = MIN(_treeNextLine, start); _treeDirtyEnd = _document->lineCount(); }
  for (LESourceRowView *row in _rows) {
    if (row.lineIndex < start) continue;
    if (change.fallback) {
      row.lineIndex = NSNotFound;
      for (size_t i = 0; i < change.fallback->lines.size(); ++i) {
        if (change.fallback->lines[i].id == row.lineId) { row.lineIndex = start + i; break; }
      }
    }
    [row invalidateText];
  }
  [self scheduleSyntax];
  if (change.fallback) {
    NSMutableArray *lines = [NSMutableArray array];
    for (const auto &line : change.fallback->lines) [lines addObject:@{@"id":[NSString stringWithFormat:@"%llu", line.id]}];
    return @{@"startLine":@(start), @"removedLineCount":@(change.fallback->removedLineCount), @"lines":lines,
      @"revision":@(change.revision), @"lineCount":@(_document->lineCount()), @"offset":@0, @"removedLength":@0, @"insertedText":@""};
  }
  return @{@"startLine":@(start), @"retainedId":[NSString stringWithFormat:@"%llu", change.retainedId],
    @"firstId":@(change.firstId), @"count":@(change.count), @"revision":@(change.revision), @"lineCount":@(_document->lineCount())};
}
- (void)configureSyntaxLanguage:(NSString *)language theme:(NSString *)theme enabled:(BOOL)enabled {
  if ([_syntaxLanguage isEqualToString:language] && [_syntaxTheme isEqualToString:theme] && _syntaxEnabled == enabled) return;
  const BOOL paletteOnly = _treeSyntax && [_syntaxLanguage isEqualToString:language] && _syntaxEnabled == enabled;
  _syntaxLanguage = [language copy]; _syntaxTheme = [theme copy]; _syntaxEnabled = enabled;
  if (paletteOnly) { [self refreshTreePalette]; return; }
  [self resetSyntax];
}
- (void)setSyntaxBackend:(NSString *)backend {
  if ([_syntaxBackend isEqualToString:backend]) return;
  _syntaxBackend = [backend copy]; [self resetSyntax];
}
- (void)setSourceLoading:(BOOL)loading {
  _sourceLoading = loading;
  if (!loading) [self scheduleSyntax];
}
- (void)setGrammarRevision:(NSUInteger)revision {
  if (_grammarRevision == revision) return;
  _grammarRevision = revision;
  if (_treeSyntax) {
    // A new embedded parser changes queries, not source text. Keep the worker's
    // existing tree/mirror and retained colors instead of recopying a large file.
    ++_treeRevision;
    _treeVisibleRevision = NSNotFound;
    _treeNextLine = _treeKnownEnd = 0;
    _treeDirtyEnd = _document->lineCount();
    [self scheduleSyntax];
  }
}
- (void)setSyntaxHighlightingInBackground:(BOOL)enabled {
  if (_syntaxHighlightingInBackground == enabled) return;
  _syntaxHighlightingInBackground = enabled;
  // Switching scheduling policies must preserve tokens, edits and undo.
  [self scheduleSyntax];
}
- (void)retireSyntax {
  if (_treeJobCancellation) *_treeJobCancellation = true;
  if (_treeSyntax) _treeSyntax->cancelled = true;
  auto tree = std::move(_treeSyntax);
  auto rows = std::make_shared<decltype(_treeRows)>(std::move(_treeRows));
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ (void)tree; (void)rows; });
  _treeColors = nil; _treeCaptures.clear(); _treeFontStyles.clear();
}
- (void)resetSyntax {
  _requestedGrammarNames.clear();
  [self retireSyntax];
  _treeNextLine = 0; _treeBusy = NO;
  if (_syntaxEnabled && _syntaxLanguage
      && syntax::TreeSitterHighlighter::supports(_syntaxLanguage.UTF8String)) {
    _treeSyntax = std::make_shared<legend::source::SourceTreeSyntax>(_syntaxLanguage.UTF8String);
    _treeQueue = dispatch_queue_create("app.legend.source-editor.tree-sitter", dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0));
    _treeCopiedUnits = _treeNextLine = _treeRevision = _treeKnownEnd = _treeDirtyEnd = 0;
    _treeVisibleRevision = NSNotFound;
    _treeBusy = _treePrefixDone = _treeParsePending = NO;
  }
  if (self.onSyntaxError) self.onSyntaxError(@"");
  for (LESourceRowView *row in _rows) [row invalidateText];
  [self scheduleSyntax];
}
- (void)scheduleSyntax {
  if (_treeSyntax) [self scheduleTreeSyntax];
  else if (self.onSyntaxProgress) self.onSyntaxProgress(0, _document->lineCount(), NO);
}
- (std::vector<syntax::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme {
  return syntax::resolveSyntaxScopeStyles(theme.UTF8String, scopes, 0);
}
- (void)refreshTreePalette {
  if (!_treeSyntax || _treeCaptures.empty()) return;
  auto worker = _treeSyntax;
  const auto captures = _treeCaptures;
  NSString *theme = [_syntaxTheme copy];
  __weak LESourceInputView *weakSelf = self;
  dispatch_async(_treeQueue, ^{
    if (worker->cancelled) return;
    std::vector<std::vector<std::string>> scopes;
    for (size_t id = 0; id < captures.size(); ++id) {
      const auto& capture = captures[id];
      auto scope = syntax::TreeSitterHighlighter::themeScope(capture);
      scopes.push_back({syntax::TreeSitterHighlighter::rootScopeForCapture(static_cast<uint32_t>(id))});
      if (!scope.empty()) scopes.back().push_back(std::move(scope));
    }
    std::vector<syntax::SyntaxStyle> styles;
    NSString *error = nil;
    try {
      LESourceInputView *owner = weakSelf;
      if (!owner) return;
      styles = [owner resolveTreeStyles:scopes theme:theme];
    }
    catch (const std::exception& cause) { error = [NSString stringWithUTF8String:cause.what()]; }
    dispatch_async(dispatch_get_main_queue(), ^{
      LESourceInputView *self = weakSelf;
      if (!self || self->_treeSyntax != worker || ![theme isEqualToString:self->_syntaxTheme]) return;
      if (error) { if (self.onSyntaxError) self.onSyntaxError(error); return; }
      NSMutableArray<NSColor *> *colors = [NSMutableArray new];
      self->_treeFontStyles.clear();
      for (const auto& style : styles) {
        unsigned int rgb = 0xeeeeee;
        NSString *hex = [[NSString stringWithUTF8String:style.foreground.c_str()] stringByReplacingOccurrencesOfString:@"#" withString:@""];
        if (hex.length == 6) [[NSScanner scannerWithString:hex] scanHexInt:&rgb];
        [colors addObject:[NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1]];
        self->_treeFontStyles.push_back(static_cast<int>(style.fontStyle));
      }
      self->_treeColors = colors;
      for (LESourceRowView *row in self->_rows) [row invalidateText];
    });
  });
}
- (void)scheduleTreeSyntax {
  if (!_treeSyntax || _treeBusy) return;
  auto worker = _treeSyntax;
  const auto revision = _treeRevision;
  const BOOL copying = _treeCopiedUnits < _document->length();
  const BOOL prefix = !_treePrefixDone;
  // Native first paint is independent of both parser construction and full work.
  if (!prefix && !_startupDrawn) return;
  size_t from = NSNotFound, to = 0;
  for (LESourceRowView *row in _rows) {
    if (![self isCurrentRow:row]) continue;
    from = MIN(from, row.lineIndex);
    to = MAX(to, row.lineIndex + 1);
  }
  if (from == NSNotFound) { from = 0; to = MIN(_document->lineCount(), 128); }
  from = from > 32 ? from - 32 : 0;
  to = MIN(_document->lineCount(), MIN(from + 256, to + 32));
  const BOOL visible = _treeVisibleRevision != revision || from != _treeVisibleStart || to != _treeVisibleEnd;
  const BOOL fullReady = !copying && !_sourceLoading;
  if (!prefix && !copying && !fullReady) return;
  if (!prefix && !copying && !visible && (!_syntaxHighlightingInBackground || _treeNextLine >= _document->lineCount())) return;
  const auto offset = _treeCopiedUnits;
  size_t count = MIN(prefix ? 16384 : 262144, _document->length() - offset);
  if (_treeParsePending) count = 0; // Resume the same mirror; don't append the prefix twice.
  if (prefix && _document->lineCount() > 128) count = MIN(count, _document->lineOffset(128));
  // A read boundary must not cut a surrogate pair. A parser job only reads its
  // worker mirror, which cannot change until that job returns.
  if (count && offset + count < _document->length()) {
    const auto unit = _document->slice(offset + count - 1, 1)[0];
    if (unit >= 0xd800 && unit <= 0xdbff) --count;
  }
  auto chunk = std::make_shared<const std::u16string>(_document->slice(offset, count));
  _treeCopiedUnits += count;
  const BOOL parse = _treeParsePending || prefix || (!_sourceLoading && _treeCopiedUnits == _document->length());
  const auto start = prefix ? 0 : visible ? from : _treeNextLine;
  const auto batch = prefix ? 128 : visible ? MIN(to - from, 256) : 512;
  const auto capturedCount = _treeCaptures.size();
  _treeBusy = YES;
  auto interrupted = std::make_shared<std::atomic_bool>(false);
  _treeJobCancellation = interrupted;
  __weak LESourceInputView *weakSelf = self;
  dispatch_async(_treeQueue, ^{
    std::vector<legend::source::SourceSyntaxRow> result;
    std::vector<std::string> captures;
    std::vector<std::string> missingLanguages;
    std::pair<size_t, size_t> invalidated{0, 0};
    NSString *error = nil;
    bool complete = false;
    try {
      if (worker->cancelled) return;
      if (!chunk->empty()) worker->replace(offset, 0, *chunk);
      if (parse && (complete = worker->parseSlice(4, interrupted.get()))) {
        invalidated = worker->takeInvalidatedLines();
        if (start < worker->lineCount()) result = worker->highlight(start, batch, interrupted.get());
        if (worker->captureCount() != capturedCount) captures = worker->captures();
        missingLanguages = worker->missingLanguages();
      }
    } catch (const std::exception& cause) { if (!interrupted->load()) error = [NSString stringWithUTF8String:cause.what()]; }
    dispatch_async(dispatch_get_main_queue(), ^{
      LESourceInputView *self = weakSelf;
      if (!self || self->_treeSyntax != worker) return;
      self->_treeBusy = NO;
      self->_treeParsePending = parse && (!complete || interrupted->load());
      if (error) {
        // Keep the editor usable; unsupported/erroring syntax cannot block input.
        worker->cancelled = true;
        self->_treeSyntax.reset();
        if (self.onSyntaxError) self.onSyntaxError(error);
        return;
      }
      if (prefix && complete && !interrupted->load()) self->_treePrefixDone = YES;
      if (self.onGrammarRequired) for (const auto& language : missingLanguages)
        if (self->_requestedGrammarNames.insert(language).second) self.onGrammarRequired([NSString stringWithUTF8String:language.c_str()]);
      if (revision == self->_treeRevision && parse && complete && !interrupted->load()) {
        if (invalidated.second > invalidated.first) {
          self->_treeNextLine = MIN(self->_treeNextLine, invalidated.first);
          self->_treeDirtyEnd = MAX(self->_treeDirtyEnd, invalidated.second);
        }
        std::unordered_set<uint64_t> changed;
        for (const auto& line : result) {
          if (line.index >= self->_document->lineCount()) continue;
          const auto id = self->_document->line(line.index).id;
          auto found = self->_treeRows.find(id);
          if (found == self->_treeRows.end() || found->second != line.tokens) {
            self->_treeRows[id] = line.tokens; changed.insert(id);
          }
        }
        if (!captures.empty()) { self->_treeCaptures = std::move(captures); [self refreshTreePalette]; }
        if (visible && !prefix) { self->_treeVisibleRevision = revision; self->_treeVisibleStart = from; self->_treeVisibleEnd = to; }
        if (start <= self->_treeNextLine) {
          self->_treeNextLine = MAX(self->_treeNextLine, start + result.size());
          if (self->_treeNextLine >= self->_treeDirtyEnd) {
            self->_treeNextLine = MAX(self->_treeNextLine, self->_treeKnownEnd);
            self->_treeDirtyEnd = 0;
          }
          self->_treeKnownEnd = MAX(self->_treeKnownEnd, self->_treeNextLine);
        }
        for (LESourceRowView *row in self->_rows) if (changed.count(row.lineId)) [row invalidateText];
      } else if (parse && complete) {
        // An overlapping completion cannot establish validity for a newer
        // revision. Keep its old colors, but conservatively revalidate the tail.
        self->_treeNextLine = self->_treeKnownEnd = 0;
        self->_treeDirtyEnd = self->_document->lineCount();
      }
      const BOOL active = self->_sourceLoading || self->_treeCopiedUnits < self->_document->length()
        || (self->_syntaxHighlightingInBackground && self->_treeNextLine < self->_document->lineCount());
      const auto now = NSProcessInfo.processInfo.systemUptime;
      if (self.onSyntaxProgress && (now - self->_lastProgressAt >= 0.1 || active != self->_lastProgressActive)) {
        self->_lastProgressAt = now; self->_lastProgressActive = active;
        self.onSyntaxProgress(MIN(self->_treeNextLine, self->_document->lineCount()), self->_document->lineCount(), active);
      }
      // No syntax debounce. Each bounded batch yields to input and new edits.
      dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf scheduleSyntax]; });
    });
  });
}
- (void)applySyntaxToText:(NSMutableAttributedString *)text line:(NSUInteger)index font:(NSFont *)font {
  if (_treeSyntax) {
    const auto found = _treeRows.find(_document->line(index).id);
    if (found == _treeRows.end()) return;
    for (const auto& token : found->second) {
      if (token.start >= text.length || token.capture >= _treeColors.count) continue;
      const auto range = NSMakeRange(token.start, MIN(token.length, text.length - token.start));
      [text addAttribute:NSForegroundColorAttributeName value:_treeColors[token.capture] range:range];
      const auto flags = _treeFontStyles[token.capture];
      const NSFontTraitMask traits = (flags & 1 ? NSItalicFontMask : 0) | (flags & 2 ? NSBoldFontMask : 0);
      if (traits) [text addAttribute:NSFontAttributeName value:[NSFontManager.sharedFontManager convertFont:font toHaveTrait:traits] range:range];
      if (flags & 4) [text addAttribute:NSUnderlineStyleAttributeName value:@(NSUnderlineStyleSingle) range:range];
    }
    return;
  }
  // A scheduling frontier is not a rendering-validity frontier. Stable line IDs
  // retain useful colors while a structural edit is being reparsed.

}
- (LESourceLineLayout *)layoutForLine:(NSUInteger)index referenceRow:(LESourceRowView *)row {
  if (row && row.bounds.size.width > 72) {
    NSFont *font = [NSFont fontWithName:row.fontFamily size:row.fontSize] ?: [NSFont monospacedSystemFontOfSize:row.fontSize weight:NSFontWeightRegular];
    NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
    paragraph.tabStops = @[];
    paragraph.defaultTabInterval = 4 * [@" " sizeWithAttributes:@{NSFontAttributeName:font}].width;
    _layoutAttributes = @{NSFontAttributeName:font, NSForegroundColorAttributeName:row.foreground, NSParagraphStyleAttributeName:paragraph};
    _layoutWidth = row.bounds.size.width - 72;
    _layoutLineHeight = row.lineHeight;
    _layoutWrap = row.wrap;
  }
  if (!_layoutAttributes || index >= _document->lineCount()) return nil;
  NSMutableAttributedString *text = [[NSMutableAttributedString alloc] initWithString:string(_document->line(index).text) attributes:_layoutAttributes];
  [self applySyntaxToText:text line:index font:_layoutAttributes[NSFontAttributeName]];
  return [[LESourceLineLayout alloc] initWithText:text width:_layoutWidth lineHeight:_layoutLineHeight wrap:_layoutWrap];
}
- (NSString *)source { return string(_document->text()); }
- (void)registerRow:(LESourceRowView *)row { [_rows addObject:row]; [self scheduleSyntax]; }
- (void)requestVisibleSyntax { [self scheduleSyntax]; }
- (void)recordStartupDraw {
  if (!_startupDrawn) {
    _startupDrawn = YES;
    if (self.onFirstDraw) self.onFirstDraw();
    [self scheduleSyntax];
  }
}
- (void)unregisterRow:(LESourceRowView *)row { [_rows removeObject:row]; }
- (BOOL)isCurrentRow:(LESourceRowView *)row {
  return row.lineIndex < _document->lineCount() && _document->line(row.lineIndex).id == row.lineId;
}
- (NSUInteger)offsetForRow:(LESourceRowView *)row {
  return [self isCurrentRow:row] ? _document->lineOffset(row.lineIndex) : NSNotFound;
}
- (NSString *)textForRow:(LESourceRowView *)row {
  return [self isCurrentRow:row] ? string(_document->line(row.lineIndex).text) : @"";
}
- (void)publishSelection {
  // Pointer-driven autoscroll owns the viewport during a drag. Caret reveal
  // would otherwise fight it, especially while recycled rows are mounting.
  _needsSelectionReveal = !_dragActive;
  for (LESourceRowView *row in _rows) row.needsDisplay = YES;
  [self.inputContext invalidateCharacterCoordinates];
  NSAccessibilityPostNotification(self, NSAccessibilitySelectedTextChangedNotification);
  // This event asks the JS list to reveal an unmounted keyboard/input target.
  // During dragging, native autoscroll must not compete with scrollToIndex.
  if (self.onSelection && !_dragActive) self.onSelection(_document->position(_head).line, MIN(_head, _anchor), MAX(_head, _anchor) - MIN(_head, _anchor));
  for (LESourceRowView *row in _rows) {
    [row layoutSubtreeIfNeeded];
    [self revealSelectionInRow:row];
  }
}
- (void)revealSelectionInRow:(LESourceRowView *)row {
  if (!_needsSelectionReveal || ![self isCurrentRow:row] || !row.enclosingScrollView) return;
  auto position = _document->position(_head);
  if (row.lineIndex != position.line) return;
  // Wait for both CoreText and Fabric's measured row height before revealing.
  // Scrolling to the logical row's index cannot reveal a caret deep inside it.
  if (!row.textLayout || row.bounds.size.height + 0.5 < row.textLayout.height) return;
  NSRect caret = [row.textLayout caretRectAtOffset:position.column downstream:YES];
  caret.origin.x += 64;
  _needsSelectionReveal = NO;
  [row scrollRectToVisible:caret];
}
- (void)selectInRow:(LESourceRowView *)row event:(NSEvent *)event extending:(BOOL)extending {
  if (![self isCurrentRow:row]) return;
  [self.window makeFirstResponder:self];
  [self unmarkText];
  auto offset = [self offsetForRow:row];
  NSUInteger local = [row.textLayout offsetAtPoint:[row textPointForWindowPoint:event.locationInWindow]];
  _head = offset + local;
  if (!extending) _anchor = _head;
  if (event.clickCount >= 3 && !extending) {
    _anchor = offset;
    _head = offset + _document->line(row.lineIndex).size();
  } else if (event.clickCount == 2 && !extending) {
    NSString *text = [self textForRow:row];
    [text enumerateSubstringsInRange:NSMakeRange(0, text.length) options:NSStringEnumerationByWords
                         usingBlock:^(NSString *word, NSRange range, NSRange enclosing, BOOL *stop) {
      if (local >= range.location && local <= NSMaxRange(range)) {
        self->_anchor = offset + range.location;
        self->_head = offset + NSMaxRange(range);
        *stop = YES;
      }
    }];
  }
  _preferredX = NAN;
  [self publishSelection];
}
- (void)keyDown:(NSEvent *)event { [self endSelectionDrag]; [self interpretKeyEvents:@[event]]; }
- (void)beginSelectionDragInRow:(LESourceRowView *)row event:(NSEvent *)event {
  [self endSelectionDrag];
  if (![self isCurrentRow:row] || !row.enclosingScrollView || !self.window) return;
  _dragActive = YES;
  _dragMoved = NO;
  _needsSelectionReveal = NO;
  _dragScrollView = row.enclosingScrollView;
  _dragPoint = event.locationInWindow;
  __weak LESourceInputView *weakSelf = self;
  _dragMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp handler:^NSEvent *(NSEvent *next) {
    LESourceInputView *self = weakSelf;
    if (!self || !self->_dragActive) return next;
    if (next.window != self.window) { [self endSelectionDrag]; return next; }
    if (next.type == NSEventTypeLeftMouseDragged || self->_dragMoved) [self updateSelectionDragAtWindowPoint:next.locationInWindow];
    if (next.type == NSEventTypeLeftMouseUp) [self endSelectionDrag];
    return nil;
  }];
  _dragWindowObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowDidResignKeyNotification object:self.window queue:nil usingBlock:^(NSNotification *note) {
    [weakSelf endSelectionDrag];
  }];
  // The input controller, not the mouse-down row, owns tracking. That row can
  // disappear or be recycled while the pointer remains below the viewport.
  _dragTimer = [NSTimer timerWithTimeInterval:1.0 / 60 repeats:YES block:^(NSTimer *timer) { [weakSelf selectionDragTick]; }];
  [NSRunLoop.mainRunLoop addTimer:_dragTimer forMode:NSRunLoopCommonModes];
}
- (void)endSelectionDrag {
  _dragActive = NO;
  _dragMoved = NO;
  [_dragTimer invalidate]; _dragTimer = nil;
  if (_dragMonitor) { [NSEvent removeMonitor:_dragMonitor]; _dragMonitor = nil; }
  if (_dragWindowObserver) { [NSNotificationCenter.defaultCenter removeObserver:_dragWindowObserver]; _dragWindowObserver = nil; }
  _dragScrollView = nil;
}
- (void)updateSelectionDragAtWindowPoint:(NSPoint)point {
  _dragMoved = YES;
  _dragPoint = point;
  [self selectionDragTick];
}
- (void)selectionDragTick {
  NSScrollView *scroll = _dragScrollView;
  if (!_dragActive || !scroll || scroll.window != self.window) { [self endSelectionDrag]; return; }
  if (!_dragMoved) return; // Preserve word/line selection until a real drag.
  NSClipView *clip = scroll.contentView;
  NSPoint point = [clip convertPoint:_dragPoint fromView:nil];
  NSRect viewport = clip.bounds;
  CGFloat overshoot = point.y < NSMinY(viewport) ? point.y - NSMinY(viewport)
    : point.y > NSMaxY(viewport) ? point.y - NSMaxY(viewport) : 0;
  if (overshoot) {
    CGFloat step = copysign(MIN(32, MAX(2, fabs(overshoot) * 0.25)), overshoot);
    NSRect next = viewport; next.origin.y += step;
    next = [clip constrainBoundsRect:next];
    [clip scrollToPoint:next.origin];
    [scroll reflectScrolledClipView:clip];
    viewport = clip.bounds;
    point = [clip convertPoint:_dragPoint fromView:nil];
  }
  // Clamp to the visible edge and choose the closest mounted row, including
  // gaps between rows. A stationary pointer continues extending every tick.
  point.y = MIN(MAX(point.y, NSMinY(viewport)), NSMaxY(viewport) - 0.5);
  NSPoint windowPoint = [clip convertPoint:point toView:nil];
  LESourceRowView *target = nil;
  CGFloat nearest = CGFLOAT_MAX;
  for (LESourceRowView *row in _rows) {
    if (![self isCurrentRow:row] || row.enclosingScrollView != scroll) continue;
    NSRect rect = [row convertRect:row.bounds toView:clip];
    if (!NSIntersectsRect(rect, viewport)) continue;
    CGFloat distance = MAX(NSMinY(rect) - point.y, MAX(point.y - NSMaxY(rect), 0));
    if (distance < nearest) { nearest = distance; target = row; }
  }
  if (!target) return; // Wait for the next virtualized row commit.
  [target layoutSubtreeIfNeeded];
  NSPoint local = [target textPointForWindowPoint:windowPoint];
  local.y = MIN(MAX(0, local.y), MAX(0, target.textLayout.height - 0.5));
  NSUInteger nextHead = [self offsetForRow:target] + [target.textLayout offsetAtPoint:local];
  if (nextHead != _head) {
    _head = nextHead; _preferredX = NAN;
    [self publishSelection];
  }
}
- (BOOL)performKeyEquivalent:(NSEvent *)event {
  if (self.window.firstResponder != self || !(event.modifierFlags & NSEventModifierFlagCommand)) return NO;
  NSString *key = event.charactersIgnoringModifiers.lowercaseString;
  if ([key isEqualToString:@"a"]) [self selectAll:nil];
  else if ([key isEqualToString:@"c"]) [self copy:nil];
  else if ([key isEqualToString:@"x"]) [self cut:nil];
  else if ([key isEqualToString:@"v"]) [self paste:nil];
  else if ([key isEqualToString:@"z"]) {
    [self unmarkText];
    if (event.modifierFlags & NSEventModifierFlagShift) [_history redo]; else [_history undo];
  } else return NO;
  return YES;
}
- (void)undo:(id)sender { [self unmarkText]; [_history undo]; }
- (void)redo:(id)sender { [self unmarkText]; [_history redo]; }
- (void)performFindPanelAction:(id)sender {
  if ([sender tag] == NSTextFinderActionShowFindInterface || [sender tag] == NSTextFinderActionShowReplaceInterface) [self showFindPanel];
}
- (BOOL)validateUserInterfaceItem:(id<NSValidatedUserInterfaceItem>)item {
  if (item.action == @selector(undo:)) return _history.canUndo || self.hasMarkedText;
  if (item.action == @selector(redo:)) return _history.canRedo && !self.hasMarkedText;
  if (item.action == @selector(performFindPanelAction:)) return item.tag == NSTextFinderActionShowFindInterface || item.tag == NSTextFinderActionShowReplaceInterface;
  return YES;
}
- (void)doCommandBySelector:(SEL)selector {
  if ([self respondsToSelector:selector]) {
    void (*invoke)(id, SEL, id) = (void (*)(id, SEL, id))[self methodForSelector:selector];
    invoke(self, selector, nil);
  }
  else [super doCommandBySelector:selector];
}
- (void)applyEditingPlan:(const legend::source::EditingPlan&)plan {
  [self unmarkText];
  [_history beginUndoGrouping];
  [self replaceRange:NSMakeRange(plan.offset, plan.removed) text:string(plan.text) recordUndo:YES];
  _anchor = MIN(plan.anchor, _document->length()); _head = MIN(plan.head, _document->length());
  [_history endUndoGrouping];
  [self publishSelection];
}
- (void)selectLine:(NSUInteger)line {
  const auto offset = _document->lineOffset(MIN(line, _document->lineCount() - 1));
  [self setAccessibilitySelectedTextRange:NSMakeRange(offset, 0)];
}
- (void)replaceSelectionWithText:(NSString *)text {
  [_history beginUndoGrouping];
  [self insertText:text replacementRange:self.selectedRange];
  [_history endUndoGrouping];
}
- (BOOL)performEditingCommand:(NSString *)command {
  using namespace legend::source;
  [self unmarkText];
  if ([command isEqual:@"indent"] || [command isEqual:@"outdent"]) [self applyEditingPlan:indentLines(*_document, _anchor, _head, utf16(self.indentUnit), [command isEqual:@"outdent"])];
  else if ([command isEqual:@"duplicateLine"]) [self applyEditingPlan:duplicateLines(*_document, _anchor, _head)];
  else if ([command isEqual:@"moveLineUp"] || [command isEqual:@"moveLineDown"]) [self applyEditingPlan:moveLines(*_document, _anchor, _head, [command isEqual:@"moveLineDown"])];
  else if ([command isEqual:@"toggleComment"]) {
    NSString *marker = nil;
    if ([@[@"javascript", @"typescript", @"tsx", @"c", @"cpp", @"c_sharp", @"csharp", @"java", @"kotlin", @"swift", @"rust", @"go", @"dart", @"scala", @"zig", @"wgsl", @"glsl", @"scss", @"jsonc", @"php", @"protobuf"] containsObject:_syntaxLanguage]) marker = @"//";
    else if ([@[@"python", @"ruby", @"bash", @"fish", @"powershell", @"yaml", @"toml", @"make", @"cmake", @"r", @"perl", @"julia", @"hcl", @"nix", @"elixir", @"graphql", @"dockerfile", @"gitignore"] containsObject:_syntaxLanguage]) marker = @"#";
    else if ([@[@"sql", @"lua"] containsObject:_syntaxLanguage]) marker = @"--";
    else if ([@[@"latex", @"erlang"] containsObject:_syntaxLanguage]) marker = @"%";
    else if ([@[@"ini", @"clojure"] containsObject:_syntaxLanguage]) marker = @";";
    if (!marker) return NO;
    [self applyEditingPlan:toggleComments(*_document, _anchor, _head, utf16(marker))];
  } else return NO;
  return YES;
}
- (void)replaceRange:(NSRange)range text:(NSString *)text recordUndo:(BOOL)recordUndo {
  if (range.location > _document->length() || range.length > _document->length() - range.location) return;
  // NSTextInputContext may reuse a mutable insertion string after this call.
  // Undo must retain the edit's original length, not that transient object's.
  text = [text copy];
  NSUInteger insertedLength = text.length;
  if (!range.length && !insertedLength) return;
  const uint64_t previousState = _editState;
  if (_history.isUndoing || _history.isRedoing) _pairedClosers.clear();
  else {
    std::map<NSUInteger, unichar> mapped;
    for (const auto& [offset, closer] : _pairedClosers) {
      if (offset < range.location) mapped[offset] = closer;
      else if (offset >= NSMaxRange(range)) mapped[offset - range.length + insertedLength] = closer;
    }
    _pairedClosers = std::move(mapped);
  }
  if (recordUndo) {
    NSString *before = string(_document->slice(range.location, range.length));
    NSUInteger anchor = _anchor, head = _head;
    [_history registerUndoWithTarget:self handler:^(LESourceInputView *target) {
      [target replaceRange:NSMakeRange(range.location, insertedLength) text:before recordUndo:YES];
      target->_editState = previousState;
      [target publishDocumentState];
      target->_anchor = anchor;
      target->_head = head;
      [target publishSelection];
    }];
  }
  std::vector<uint64_t> oldIds;
  const auto oldStart = _document->position(range.location).line;
  const auto oldStartColumn = range.location - _document->lineOffset(oldStart);
  const auto oldLineId = _document->line(oldStart).id;
  const bool oneLine = oldStart == _document->position(NSMaxRange(range)).line
    && [text rangeOfCharacterFromSet:NSCharacterSet.newlineCharacterSet].location == NSNotFound;
  const auto oldEnd = MIN(_document->lineCount(), _document->position(NSMaxRange(range)).line + 2);
  for (size_t i = oldStart ? oldStart - 1 : 0; i < oldEnd; ++i) oldIds.push_back(_document->line(i).id);
  auto change = _document->replace(range.location, range.length, utf16(text));
  [_searchPanel invalidate];
  _editState = _nextEditState++;
  [self publishDocumentState];
  if (_treeSyntax) {
    ++_treeRevision;
    if (_treeJobCancellation) *_treeJobCancellation = true;
    const auto map = [&](NSUInteger index) -> NSUInteger {
      if (index <= change.startLine) return index;
      if (index >= change.startLine + change.removedLineCount) return index - change.removedLineCount + change.lines.size();
      return change.startLine + change.lines.size();
    };
    _treeNextLine = MIN(_treeNextLine, change.startLine);
    _treeKnownEnd = map(_treeKnownEnd);
    _treeDirtyEnd = MAX(map(_treeDirtyEnd), change.startLine + change.lines.size());
    // Mirror only the already-copied prefix. Edits beyond it will be included in
    // later bounded snapshots; edits crossing its boundary truncate the mirror.
    if (range.location <= _treeCopiedUnits) {
      const auto removed = MIN(range.length, _treeCopiedUnits - range.location);
      const auto inserted = std::make_shared<const std::u16string>(change.insertedText);
      auto worker = _treeSyntax;
      _treeCopiedUnits = _treeCopiedUnits - removed + inserted->size();
      dispatch_async(_treeQueue, ^{ if (!worker->cancelled) worker->replace(range.location, removed, *inserted); });
    }
    std::unordered_set<uint64_t> retained;
    for (const auto& line : change.lines) retained.insert(line.id);
    for (auto id : oldIds) if (!retained.count(id)) _treeRows.erase(id);
    if (oneLine) {
      const auto found = _treeRows.find(oldLineId);
      if (found != _treeRows.end()) {
        std::vector<legend::source::SourceSyntaxToken> shifted;
        for (auto token : found->second) {
          const auto end = token.start + token.length;
          if (end <= oldStartColumn) shifted.push_back(token);
          else if (token.start >= oldStartColumn + range.length) {
            token.start = token.start - range.length + text.length; shifted.push_back(token);
          } else if (token.start <= oldStartColumn && end >= oldStartColumn + range.length) {
            token.length = token.length - range.length + text.length; shifted.push_back(token);
          }
        }
        found->second = std::move(shifted);
      }
    }
    [self scheduleSyntax];
  }

  // The native buffer advances before Fabric receives the transaction. Keep
  // mounted rows attached to their logical IDs during that interval.
  for (LESourceRowView *row in _rows) {
    NSUInteger index = row.lineIndex;
    if (index >= change.startLine + change.removedLineCount && index != NSNotFound) {
      row.lineIndex = index - change.removedLineCount + change.lines.size();
    } else if (index >= change.startLine) {
      row.lineIndex = NSNotFound;
      for (size_t i = 0; i < change.lines.size(); ++i) {
        if (change.lines[i].id == row.lineId) { row.lineIndex = change.startLine + i; break; }
      }
    }
    if (index < change.startLine || (index != NSNotFound && index >= change.startLine + change.removedLineCount)) {
      row.needsDisplay = YES; // Renumber the gutter without throwing away unchanged glyphs.
    } else [row invalidateText];
  }
  _anchor = _head = range.location + text.length;
  NSMutableArray *lines = [NSMutableArray array];
  for (const auto &line : change.lines) {
    [lines addObject:@{@"id": [NSString stringWithFormat:@"%llu", line.id]}];
  }
  NSDictionary *event = @{@"startLine":@(change.startLine), @"removedLineCount":@(change.removedLineCount),
    @"lines":lines, @"revision":@(change.revision), @"lineCount":@(_document->lineCount()),
    @"offset":@(range.location), @"removedLength":@(range.length), @"insertedText":text};
  if (self.onEdit) {
    NSData *json = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    self.onEdit([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding]);
  }
  NSAccessibilityPostNotification(self, NSAccessibilityValueChangedNotification);
  for (LESourceRowView *row in _rows) { row.needsLayout = YES; row.needsDisplay = YES; }
  [self publishSelection];
}
- (void)insertText:(id)value replacementRange:(NSRange)replacement {
  NSString *text = [value isKindOfClass:NSAttributedString.class] ? [value string] : value;
  NSRange range = replacement.location != NSNotFound ? replacement : ([self hasMarkedText] ? _marked : self.selectedRange);
  if (range.location > _document->length() || range.length > _document->length() - range.location) return;
  BOOL composing = [self hasMarkedText];
  if (self.automaticPairs && !composing && replacement.location == NSNotFound && text.length == 1) {
    const unichar character = [text characterAtIndex:0];
    const auto tracked = _pairedClosers.find(range.location);
    if (!range.length && tracked != _pairedClosers.end() && tracked->second == character) {
      _pairedClosers.erase(tracked); _anchor = _head = range.location + 1; [self publishSelection]; return;
    }
    const unichar close = character == '(' ? ')' : character == '[' ? ']' : character == '{' ? '}' : character == '"' || character == '\'' ? character : 0;
    const auto at = _document->position(range.location);
    // Ordinary typing never scans the line. On exceptionally long lines, keep
    // punctuation literal rather than paying an unbounded context-scan cost.
    if (close && at.column <= 2048) {
    const auto prefix = _document->line(at.line).text.substr(0, at.column);
    bool safe = true; char16_t quote = 0;
    for (size_t i = 0; i < prefix.size(); ++i) {
      const auto c = prefix[i];
      if (c == u'\\') { ++i; continue; }
      if (quote) { if (c == quote) quote = 0; }
      else if (c == u'\'' || c == u'"' || c == u'`') quote = c;
      else if (c == u'#' || (c == u'/' && i + 1 < prefix.size() && (prefix[i + 1] == u'/' || prefix[i + 1] == u'*'))) { safe = false; break; }
    }
    safe = safe && !quote;
    const auto tokens = _treeRows.find(_document->line(at.line).id);
    if (tokens != _treeRows.end()) for (const auto& token : tokens->second) {
      if (token.start <= at.column && token.start + token.length > at.column && token.capture < _treeCaptures.size()) {
        const auto& category = _treeCaptures[token.capture];
        if (category.starts_with("comment") || category.starts_with("string")) safe = false;
      }
    }
    if ((character == '\'' || character == '"') && !prefix.empty() && ((prefix.back() >= u'a' && prefix.back() <= u'z') || (prefix.back() >= u'A' && prefix.back() <= u'Z') || (prefix.back() >= u'0' && prefix.back() <= u'9') || prefix.back() == u'_')) safe = false;
    if (safe && close) {
      NSString *selected = string(_document->slice(range.location, range.length));
      NSString *paired = [NSString stringWithFormat:@"%@%@%C", text, selected, close];
      [self replaceRange:range text:paired recordUndo:YES];
      _pairedClosers[range.location + paired.length - 1] = close;
      _anchor = range.location + 1; _head = _anchor + range.length;
      [self publishSelection]; return;
    }
    }
  }
  [self replaceRange:range text:text recordUndo:!composing];
  if (composing) {
    _marked = NSMakeRange(range.location, text.length);
    [self unmarkText];
  }
  _preferredX = NAN;
}
- (NSRange)selectedRange { return NSMakeRange(MIN(_anchor, _head), MAX(_anchor, _head) - MIN(_anchor, _head)); }
- (NSRange)markedRange { return _marked; }
- (BOOL)hasMarkedText { return _marked.location != NSNotFound; }
- (NSArray<NSAttributedStringKey> *)validAttributesForMarkedText { return @[NSUnderlineStyleAttributeName]; }
- (void)setMarkedText:(id)value selectedRange:(NSRange)selection replacementRange:(NSRange)replacement {
  NSString *text = [value isKindOfClass:NSAttributedString.class] ? [value string] : value;
  NSRange range = replacement.location != NSNotFound ? replacement : ([self hasMarkedText] ? _marked : self.selectedRange);
  if (range.location > _document->length() || range.length > _document->length() - range.location) return;
  if (![self hasMarkedText]) {
    _compositionState = _editState;
    _compositionOriginal = string(_document->slice(range.location, range.length));
    _compositionRange = range;
  }
  [self replaceRange:range text:text recordUndo:NO];
  _marked = NSMakeRange(range.location, text.length);
  _anchor = range.location + MIN(selection.location, text.length);
  _head = _anchor + MIN(selection.length, text.length - (_anchor - range.location));
  [self publishSelection];
}
- (void)unmarkText {
  if (![self hasMarkedText]) return;
  NSRange range = _marked;
  NSString *before = _compositionOriginal ?: @"";
  NSRange oldSelection = _compositionRange;
  const auto previousState = _compositionState;
  [_history registerUndoWithTarget:self handler:^(LESourceInputView *target) {
    [target replaceRange:range text:before recordUndo:YES];
    target->_editState = previousState;
    [target publishDocumentState];
    target->_anchor = oldSelection.location;
    target->_head = NSMaxRange(oldSelection);
    [target publishSelection];
  }];
  _marked = NSMakeRange(NSNotFound, 0);
  _compositionOriginal = nil;
  [self.inputContext discardMarkedText];
  [self publishSelection];
}
- (NSAttributedString *)attributedSubstringForProposedRange:(NSRange)range actualRange:(NSRangePointer)actual {
  if (range.location > _document->length()) { if (actual) *actual = NSMakeRange(NSNotFound, 0); return nil; }
  range.length = MIN(range.length, _document->length() - range.location);
  if (actual) *actual = range;
  return [[NSAttributedString alloc] initWithString:string(_document->slice(range.location, range.length))];
}
- (NSRect)firstRectForCharacterRange:(NSRange)range actualRange:(NSRangePointer)actual {
  NSUInteger offset = MIN(range.location, _document->length());
  auto position = _document->position(offset);
  for (LESourceRowView *row in _rows) {
    if (row.lineIndex == position.line && [self isCurrentRow:row]) {
      NSRect rect = [row.textLayout caretRectAtOffset:position.column downstream:YES];
      rect.origin.x += 64;
      if (actual) *actual = NSMakeRange(offset, 0);
      return [self.window convertRectToScreen:[row convertRect:rect toView:nil]];
    }
  }
  if (actual) *actual = NSMakeRange(NSNotFound, 0);
  return NSZeroRect;
}
- (NSUInteger)characterIndexForPoint:(NSPoint)screenPoint {
  NSPoint point = [self.window convertPointFromScreen:screenPoint];
  for (LESourceRowView *row in _rows) {
    NSPoint local = [row convertPoint:point fromView:nil];
    if (NSPointInRect(local, row.bounds) && [self isCurrentRow:row]) {
      return [self offsetForRow:row] + [row.textLayout offsetAtPoint:[row textPointForWindowPoint:point]];
    }
  }
  return NSNotFound;
}
- (void)selectAll:(id)sender { [self unmarkText]; _anchor = 0; _head = _document->length(); [self publishSelection]; }
- (void)copy:(id)sender {
  NSRange selection = self.selectedRange;
  if (selection.length == 0) return;
  [NSPasteboard.generalPasteboard clearContents];
  [NSPasteboard.generalPasteboard setString:string(_document->slice(selection.location, selection.length)) forType:NSPasteboardTypeString];
}
- (void)cut:(id)sender { [self copy:sender]; [self insertText:@"" replacementRange:NSMakeRange(NSNotFound, 0)]; }
- (void)paste:(id)sender {
  NSString *text = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
  if (text) [self insertText:text replacementRange:self.selectedRange];
}
- (void)insertNewline:(id)sender { [self applyEditingPlan:legend::source::newline(*_document, _anchor, _head, utf16(self.indentUnit))]; }
- (void)insertTab:(id)sender {
  if (self.selectedRange.length) [self performEditingCommand:@"indent"];
  else [self insertText:self.indentUnit replacementRange:NSMakeRange(NSNotFound, 0)];
}
- (void)insertBacktab:(id)sender { [self performEditingCommand:@"outdent"]; }
- (NSUInteger)adjacentOffset:(NSInteger)direction {
  auto position = _document->position(_head);
  auto &line = _document->line(position.line);
  NSString *text = string(line.text + line.ending);
  if (direction < 0) {
    if (line.ending == u"\r\n" && position.column > line.text.size()) return _document->lineOffset(position.line) + line.text.size();
    if (position.column > 0) return _document->lineOffset(position.line) + [text rangeOfComposedCharacterSequenceAtIndex:position.column - 1].location;
    if (position.line > 0) return _document->lineOffset(position.line - 1) + _document->line(position.line - 1).text.size();
    return 0;
  }
  // NSString's composed-character API treats CR and LF separately on macOS.
  // Source line endings are atomic for keyboard movement and deletion.
  if (line.ending == u"\r\n" && position.column >= line.text.size()) return _document->lineOffset(position.line) + line.text.size() + 2;
  if (position.column < text.length) return _document->lineOffset(position.line) + NSMaxRange([text rangeOfComposedCharacterSequenceAtIndex:position.column]);
  return _document->length();
}
- (void)deleteBackward:(id)sender {
  NSRange range = self.selectedRange;
  if (self.automaticPairs && !range.length && range.location > 0 && _pairedClosers.count(range.location)) {
    const auto before = _document->slice(range.location - 1, 1)[0];
    const auto after = _pairedClosers[range.location];
    if ((before == u'(' && after == ')') || (before == u'[' && after == ']') || (before == u'{' && after == '}') || ((before == u'\'' || before == u'"') && before == after)) {
      [self insertText:@"" replacementRange:NSMakeRange(range.location - 1, 2)]; return;
    }
  }
  if (!range.length) { range.location = [self adjacentOffset:-1]; range.length = _head - range.location; }
  [self insertText:@"" replacementRange:range];
}
- (void)deleteForward:(id)sender {
  NSRange range = self.selectedRange;
  if (!range.length) range.length = [self adjacentOffset:1] - _head;
  [self insertText:@"" replacementRange:range];
}
- (void)moveHorizontal:(NSInteger)direction extending:(BOOL)extend {
  [self unmarkText];
  NSRange selection = self.selectedRange;
  _head = !extend && selection.length ? (direction < 0 ? selection.location : NSMaxRange(selection)) : [self adjacentOffset:direction];
  if (!extend) _anchor = _head;
  _preferredX = NAN;
  [self publishSelection];
}
- (void)moveLeft:(id)sender { [self moveHorizontal:-1 extending:NO]; }
- (void)moveRight:(id)sender { [self moveHorizontal:1 extending:NO]; }
- (void)moveLeftAndModifySelection:(id)sender { [self moveHorizontal:-1 extending:YES]; }
- (void)moveRightAndModifySelection:(id)sender { [self moveHorizontal:1 extending:YES]; }
- (void)moveVertical:(NSInteger)direction extending:(BOOL)extend {
  [self unmarkText];
  auto position = _document->position(_head);
  LESourceRowView *current = nil, *next = nil, *reference = nil;
  for (LESourceRowView *row in _rows) {
    if (![self isCurrentRow:row]) continue;
    if (row.bounds.size.width > 72) reference = row;
    if (row.lineIndex == position.line) current = row;
    if ((NSInteger)row.lineIndex == (NSInteger)position.line + direction) next = row;
  }
  // Use the same shaping as drawing for unmounted lines. Preserve x through a
  // short line and into wrapped targets, even during repeated keys before the
  // recycler has mounted the previous target. Only the needed lines are shaped.
  if (current) [current layoutSubtreeIfNeeded];
  LESourceLineLayout *layout = current.textLayout ?: [self layoutForLine:position.line referenceRow:reference];
  if (layout) {
    NSRect caret = [layout caretRectAtOffset:position.column downstream:YES];
    if (isnan(_preferredX)) _preferredX = caret.origin.x;
    CGFloat y = caret.origin.y + direction * _layoutLineHeight;
    if (y >= 0 && y < layout.height) {
      _head = _document->lineOffset(position.line) + [layout offsetAtPoint:NSMakePoint(_preferredX, y + _layoutLineHeight / 2)];
    } else if ((direction < 0 && position.line > 0) || (direction > 0 && position.line + 1 < _document->lineCount())) {
      NSUInteger targetIndex = position.line + direction;
      if (next) [next layoutSubtreeIfNeeded];
      LESourceLineLayout *target = next.textLayout ?: [self layoutForLine:targetIndex referenceRow:current ?: reference];
      y = direction < 0 ? target.height - _layoutLineHeight / 2 : _layoutLineHeight / 2;
      _head = _document->lineOffset(targetIndex) + [target offsetAtPoint:NSMakePoint(_preferredX, y)];
    }
  }
  if (!extend) _anchor = _head;
  [self publishSelection];
}
- (void)moveUp:(id)sender { [self moveVertical:-1 extending:NO]; }
- (void)moveDown:(id)sender { [self moveVertical:1 extending:NO]; }
- (void)moveUpAndModifySelection:(id)sender { [self moveVertical:-1 extending:YES]; }
- (void)moveDownAndModifySelection:(id)sender { [self moveVertical:1 extending:YES]; }
- (void)moveToBeginningOfDocument:(id)sender { _anchor = _head = 0; _preferredX = NAN; [self publishSelection]; }
- (void)moveToEndOfDocument:(id)sender { _anchor = _head = _document->length(); _preferredX = NAN; [self publishSelection]; }
@end

@implementation LESourceRowView {
  NSString *_cachedText;
  CGFloat _cachedWidth;
}
- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _fontSize = 14; _lineHeight = 22; _fontFamily = @"Menlo";
    _foreground = NSColor.textColor; _wrap = YES; _cachedWidth = -1;
  }
  return self;
}
- (BOOL)isFlipped { return YES; }
- (void)setInput:(LESourceInputView *)input {
  if (_input == input) return;
  [_input unregisterRow:self];
  _input = input;
  [input registerRow:self];
  [self invalidateText];
}
- (void)applyLineId:(uint64_t)lineId index:(NSUInteger)index {
  // Native edits renumber mounted rows before the Fabric commit arrives. A
  // metrics/style commit carrying an old index must not detach that same ID.
  if (_lineId == lineId && _input && [_input offsetForRow:self] != NSNotFound) return;
  const BOOL replaced = _lineId != lineId;
  _lineId = lineId; _lineIndex = index;
  if (replaced) [self invalidateText];
  else self.needsDisplay = YES;
}
- (void)invalidateText { _cachedText = nil; self.needsLayout = YES; self.needsDisplay = YES; }
- (void)layout {
  [super layout];
  // Fabric may attach a recycled row before assigning its measured width.
  // Do not wrap a large line into one-character fragments at that transient size.
  if (!self.input || [self.input offsetForRow:self] == NSNotFound || self.bounds.size.width <= 72) return;
  NSString *text = [self.input textForRow:self] ?: @"";
  CGFloat width = MAX(1, self.bounds.size.width - 72);
  if (_cachedWidth == width && [_cachedText isEqualToString:text]) {
    [self.input revealSelectionInRow:self];
    return;
  }
  _cachedText = text; _cachedWidth = width;
  _textLayout = [self.input layoutForLine:self.lineIndex referenceRow:self];
  if (self.onMetrics) self.onMetrics(_textLayout.height, _textLayout.width + 72);
  [self.input revealSelectionInRow:self];
}
- (void)drawRect:(NSRect)dirtyRect {
  // Detached/recycled Fabric subviews can still receive a final display pass.
  // Messaging nil returns 0, which is NOT our invalid-offset sentinel.
  if (!self.input) return;
  [self layoutSubtreeIfNeeded];
  NSUInteger offset = [self.input offsetForRow:self];
  if (offset == NSNotFound) return;
  NSUInteger start = MIN(self.input.anchor, self.input.head), end = MAX(self.input.anchor, self.input.head);
  NSUInteger localStart = start > offset ? start - offset : 0;
  NSUInteger localEnd = end > offset ? MIN(end - offset, _cachedText.length) : 0;
  if (localEnd > localStart) {
    [[NSColor.selectedTextBackgroundColor colorWithAlphaComponent:0.5] setFill];
    for (NSValue *value in [_textLayout rectsForRange:NSMakeRange(localStart, localEnd - localStart)]) {
      NSRect rect = value.rectValue; rect.origin.x += 64; NSRectFill(rect);
    }
  }
  [_textLayout drawInContext:NSGraphicsContext.currentContext.CGContext origin:NSMakePoint(64, 0) dirtyRect:dirtyRect];
  if (_textLayout) [self.input recordStartupDraw];
  [[NSString stringWithFormat:@"%lu", self.lineIndex + 1] drawAtPoint:NSMakePoint(8, 2) withAttributes:@{
    NSFontAttributeName:[NSFont fontWithName:@"Menlo" size:MAX(10, self.fontSize - 1)] ?: [NSFont systemFontOfSize:12],
    NSForegroundColorAttributeName:[(self.foreground ?: NSColor.textColor) colorWithAlphaComponent:0.5],
  }];
  if (self.window.firstResponder == self.input && self.input.head >= offset && self.input.head <= offset + _cachedText.length) {
    NSRect caret = [_textLayout caretRectAtOffset:self.input.head - offset downstream:YES];
    caret.origin.x += 64; [self.foreground setFill]; NSRectFill(caret);
  }
}
- (BOOL)isAccessibilityElement { return self.input && [self.input offsetForRow:self] != NSNotFound; }
- (NSString *)accessibilityRole { return NSAccessibilityStaticTextRole; }
- (NSString *)accessibilityLabel { return [NSString stringWithFormat:@"Line %lu", self.lineIndex + 1]; }
- (id)accessibilityValue { return [self.input textForRow:self] ?: @""; }
- (NSPoint)textPointForWindowPoint:(NSPoint)point {
  NSPoint local = [self convertPoint:point fromView:nil]; local.x -= 64; return local;
}
- (void)mouseDown:(NSEvent *)event {
  [self.input selectInRow:self event:event extending:(event.modifierFlags & NSEventModifierFlagShift) != 0];
  [self.input beginSelectionDragInRow:self event:event];
}
- (void)mouseDragged:(NSEvent *)event {
  [self.input updateSelectionDragAtWindowPoint:event.locationInWindow];
}
- (void)mouseUp:(NSEvent *)event { [self.input endSelectionDrag]; }
@end
