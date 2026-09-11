#import "RNSourceEditor.h"
#include "../cpp/SourceFileReader.hpp"
#include "../cpp/SourceDocument.hpp"
#include <atomic>
#import <react/renderer/components/RNSourceEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNSourceEditorSpec/EventEmitters.h>
#import <react/renderer/components/RNSourceEditorSpec/Props.h>
#import <react/renderer/components/RNSourceEditorSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;
static NSString *str(const std::string &value) { return [NSString stringWithUTF8String:value.c_str()] ?: @""; }
static std::string utf8String(NSString *value) {
  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  return data.length ? std::string((const char *)data.bytes, data.length) : std::string();
}

struct SourceLoadJob {
  std::atomic<bool> cancelled{false};
  std::unique_ptr<legend::source::SourceFileReader> reader;
  uint64_t nextId = 1;
};

@interface RNSourceEditorHost ()
- (void)loadNextChunk:(std::shared_ptr<SourceLoadJob>)job first:(BOOL)first;
- (void)resumeAfterFirstDraw:(std::shared_ptr<SourceLoadJob>)job;
@end

@implementation RNSourceEditorHost {
  NSString *_path;
  NSString *_initialSource;
  BOOL _useInitialSource;
  BOOL _loaded, _waitingForFirstDraw;
  std::shared_ptr<SourceLoadJob> _loadJob;
}
+ (ComponentDescriptorProvider)componentDescriptorProvider { return concreteComponentDescriptorProvider<SourceEditorHostComponentDescriptor>(); }
- (instancetype)init {
  if ((self = [super init])) {
    _props = std::make_shared<const SourceEditorHostProps>();
    _input = [[LESourceInputView alloc] initWithFrame:self.bounds];
    _input.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_input];
    __weak RNSourceEditorHost *weakSelf = self;
    _input.onEdit = ^(NSString *json) {
      RNSourceEditorHost *self = weakSelf;
      if (!self || !self->_eventEmitter) return;
      std::static_pointer_cast<const SourceEditorHostEventEmitter>(self->_eventEmitter)->onEdit({.json = std::string(json.UTF8String)});
    };
    _input.onSelection = ^(NSUInteger line, NSUInteger start, NSUInteger length) {
      RNSourceEditorHost *self = weakSelf;
      if (!self || !self->_eventEmitter) return;
      std::static_pointer_cast<const SourceEditorHostEventEmitter>(self->_eventEmitter)->onSelection({
        .line = (double)line, .start = (double)start, .length = (double)length,
      });
    };
    _input.onSyntaxError = ^(NSString *error) {
      RNSourceEditorHost *self = weakSelf;
      if (!self || !self->_eventEmitter) return;
      std::static_pointer_cast<const SourceEditorHostEventEmitter>(self->_eventEmitter)->onSyntaxError({.error = utf8String(error)});
    };
    _input.onSyntaxProgress = ^(NSUInteger completed, NSUInteger total, BOOL active) {
      RNSourceEditorHost *self = weakSelf;
      if (!self || !self->_eventEmitter) return;
      std::static_pointer_cast<const SourceEditorHostEventEmitter>(self->_eventEmitter)->onProgress({
        .completedLines = (double)completed, .totalLines = (double)total, .active = (bool)active,
      });
    };
  }
  return self;
}
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &next = *std::static_pointer_cast<const SourceEditorHostProps>(props);
  NSString *path = str(next.documentPath);
  _initialSource = str(next.initialSource);
  _useInitialSource = next.useInitialSource;
  if (![_path isEqualToString:path]) { _path = path; _loaded = NO; }
  _input.syntaxBackend = str(next.syntaxBackend);
  [_input configureSyntaxLanguage:str(next.syntaxLanguage) theme:str(next.syntaxTheme) enabled:next.syntaxHighlightingEnabled];
  _input.syntaxHighlightingInBackground = next.syntaxHighlightingInBackground;
  [super updateProps:props oldProps:oldProps];
}
- (void)finalizeUpdates:(RNComponentViewUpdateMask)mask {
  [super finalizeUpdates:mask];
  if (_loaded || !_eventEmitter || !_path.length) return;
  _loaded = YES;
  if (_loadJob) _loadJob->cancelled = true;
  _loadJob = std::make_shared<SourceLoadJob>();
  _waitingForFirstDraw = NO;
  _input.onFirstDraw = nil;
  if (_useInitialSource) {
    _input.sourceLoading = NO;
    [_input loadSource:_initialSource];
    std::static_pointer_cast<const SourceEditorHostEventEmitter>(_eventEmitter)->onReady({
      .lineCount = (double)_input.lineCount, .firstId = 1, .complete = true, .error = "",
    });
    return;
  }
  [self loadNextChunk:_loadJob first:YES];
}
- (void)loadNextChunk:(std::shared_ptr<SourceLoadJob>)job first:(BOOL)first {
  __weak RNSourceEditorHost *weakSelf = self;
  NSString *path = [_path copy];
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    if (job->cancelled) return;
    @autoreleasepool {
      std::shared_ptr<legend::source::SourceDocument> chunk;
      NSString *error = @"";
      BOOL complete = NO;
      try {
        if (!job->reader) job->reader = std::make_unique<legend::source::SourceFileReader>(path.fileSystemRepresentation);
        auto source = job->reader->next(first ? 16384 : 1048576, first ? 128 : 16384);
        complete = job->reader->done();
        chunk = std::make_shared<legend::source::SourceDocument>(source, job->nextId);
        job->nextId += chunk->lineCount() - 1;
        if (complete) job->reader.reset();
      } catch (const std::exception &cause) {
        error = [NSString stringWithUTF8String:cause.what()] ?: @"Unable to load source file";
      }
      if (job->cancelled) return;
      dispatch_async(dispatch_get_main_queue(), ^{
        RNSourceEditorHost *self = weakSelf;
        if (!self || job->cancelled || self->_loadJob != job || !self->_eventEmitter) return;
        auto emitter = std::static_pointer_cast<const SourceEditorHostEventEmitter>(self->_eventEmitter);
        self->_input.sourceLoading = !complete && !error.length;
        if (first) {
          if (!error.length) {
            chunk->useEditIdRange();
            [self->_input adoptDocument:chunk];
          }
          emitter->onReady({.lineCount = chunk ? (double)chunk->lineCount() : 0, .firstId = 1,
            .complete = (bool)complete, .error = utf8String(error)});
        } else {
          NSString *json = @"";
          if (!error.length && chunk->length()) {
            NSDictionary *change = [self->_input appendDocument:std::move(*chunk)];
            NSData *data = [NSJSONSerialization dataWithJSONObject:change options:0 error:nil];
            json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
          }
          emitter->onAppend({.json = utf8String(json), .complete = (bool)complete, .error = utf8String(error)});
        }
        if (complete || error.length) return;
        if (first) {
          self->_waitingForFirstDraw = YES;
          self->_input.onFirstDraw = ^{ [weakSelf resumeAfterFirstDraw:job]; };
          // Hidden windows may not draw. Never stall their loading indefinitely.
          dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            [weakSelf resumeAfterFirstDraw:job];
          });
        } else {
          // Backpressure: at most one decoded chunk waits for the main thread.
          // Give input/layout a turn before integrating more background rows.
          dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            RNSourceEditorHost *self = weakSelf;
            if (self && !job->cancelled && self->_loadJob == job) [self loadNextChunk:job first:NO];
          });
        }
      });
    }
  });
}
- (void)resumeAfterFirstDraw:(std::shared_ptr<SourceLoadJob>)job {
  if (!_waitingForFirstDraw || job->cancelled || _loadJob != job) return;
  _waitingForFirstDraw = NO;
  _input.onFirstDraw = nil;
  [self loadNextChunk:job first:NO];
}
- (void)prepareForRecycle {
  [super prepareForRecycle];
  if (_loadJob) _loadJob->cancelled = true;
  _loadJob.reset();
  _waitingForFirstDraw = NO;
  _input.onFirstDraw = nil;
  if (self.window.firstResponder == _input) [self.window makeFirstResponder:nil];
  _input.syntaxHighlightingInBackground = NO;
  _input.sourceLoading = NO;
  _input.syntaxBackend = @"textmate";
  _path = nil; _loaded = NO; [_input loadSource:@""];
  _initialSource = nil; _useInitialSource = NO;
  [_input configureSyntaxLanguage:@"" theme:@"" enabled:NO];
}
- (void)dealloc { if (_loadJob) _loadJob->cancelled = true; }

@end

@implementation RNSourceEditorRow {
  LESourceRowView *_row;
}
+ (ComponentDescriptorProvider)componentDescriptorProvider { return concreteComponentDescriptorProvider<SourceEditorRowComponentDescriptor>(); }
- (instancetype)init {
  if ((self = [super init])) {
    _props = std::make_shared<const SourceEditorRowProps>();
    _row = [[LESourceRowView alloc] initWithFrame:self.bounds];
    _row.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_row];
    __weak RNSourceEditorRow *weakSelf = self;
    _row.onMetrics = ^(CGFloat height, CGFloat width) {
      RNSourceEditorRow *self = weakSelf;
      if (!self || !self->_eventEmitter) return;
      std::static_pointer_cast<const SourceEditorRowEventEmitter>(self->_eventEmitter)->onMetrics({
        .lineId = std::to_string(self->_row.lineId), .height = height, .width = width,
      });
    };
  }
  return self;
}
- (void)attachInput {
  NSView *ancestor = self.superview;
  while (ancestor && ![ancestor isKindOfClass:RNSourceEditorHost.class]) ancestor = ancestor.superview;
  _row.input = [(RNSourceEditorHost *)ancestor input];
  [_row.input requestVisibleSyntax];
}
- (void)viewDidMoveToWindow { [super viewDidMoveToWindow]; [self attachInput]; }
- (void)viewDidMoveToSuperview { [super viewDidMoveToSuperview]; [self attachInput]; }
- (void)finalizeUpdates:(RNComponentViewUpdateMask)mask {
  [super finalizeUpdates:mask];
  [self attachInput];
}
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &next = *std::static_pointer_cast<const SourceEditorRowProps>(props);
  const auto &previous = *std::static_pointer_cast<const SourceEditorRowProps>(_props);
  [_row applyLineId:str(next.lineId).longLongValue index:MAX(0, next.lineIndex)];
  _row.fontFamily = str(next.fontFamily);
  _row.fontSize = next.fontSize;
  _row.lineHeight = next.lineHeight;
  _row.wrap = next.wrap;
  NSString *hex = [str(next.foreground) stringByReplacingOccurrencesOfString:@"#" withString:@""];
  unsigned int rgb = 0xffffff;
  [[NSScanner scannerWithString:hex] scanHexInt:&rgb];
  _row.foreground = [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
  if (next.fontFamily != previous.fontFamily || next.fontSize != previous.fontSize
      || next.lineHeight != previous.lineHeight || next.wrap != previous.wrap
      || next.foreground != previous.foreground) [_row invalidateText];
  [super updateProps:props oldProps:oldProps];
}
- (void)prepareForRecycle {
  [super prepareForRecycle];
  _row.input = nil; _row.lineId = 0; _row.lineIndex = 0;
  [_row invalidateText];
}
@end

Class<RCTComponentViewProtocol> SourceEditorHostCls(void) { return RNSourceEditorHost.class; }
Class<RCTComponentViewProtocol> SourceEditorRowCls(void) { return RNSourceEditorRow.class; }
