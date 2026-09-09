#import "RNSourceEditor.h"
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

@implementation RNSourceEditorHost {
  NSString *_path;
  BOOL _loaded;
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
  }
  return self;
}
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &next = *std::static_pointer_cast<const SourceEditorHostProps>(props);
  NSString *path = str(next.documentPath);
  if (![_path isEqualToString:path]) { _path = path; _loaded = NO; }
  [super updateProps:props oldProps:oldProps];
}
- (void)finalizeUpdates:(RNComponentViewUpdateMask)mask {
  [super finalizeUpdates:mask];
  if (_loaded || !_eventEmitter || !_path.length) return;
  _loaded = YES;
  NSError *error = nil;
  NSString *source = [NSString stringWithContentsOfFile:_path encoding:NSUTF8StringEncoding error:&error];
  if (source) [_input loadSource:source];
  std::static_pointer_cast<const SourceEditorHostEventEmitter>(_eventEmitter)->onReady({
    .source = utf8String(source), .error = utf8String(error.localizedDescription),
  });
}
- (void)prepareForRecycle {
  [super prepareForRecycle];
  if (self.window.firstResponder == _input) [self.window makeFirstResponder:nil];
  _path = nil; _loaded = NO; [_input loadSource:@""];
}
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
}
- (void)viewDidMoveToWindow { [super viewDidMoveToWindow]; [self attachInput]; }
- (void)viewDidMoveToSuperview { [super viewDidMoveToSuperview]; [self attachInput]; }
- (void)finalizeUpdates:(RNComponentViewUpdateMask)mask {
  [super finalizeUpdates:mask];
  [self attachInput];
}
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &next = *std::static_pointer_cast<const SourceEditorRowProps>(props);
  _row.lineId = str(next.lineId).longLongValue;
  _row.lineIndex = MAX(0, next.lineIndex);
  _row.fontFamily = str(next.fontFamily);
  _row.fontSize = next.fontSize;
  _row.lineHeight = next.lineHeight;
  _row.wrap = next.wrap;
  NSString *hex = [str(next.foreground) stringByReplacingOccurrencesOfString:@"#" withString:@""];
  unsigned int rgb = 0xffffff;
  [[NSScanner scannerWithString:hex] scanHexInt:&rgb];
  _row.foreground = [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
  [_row invalidateText];
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
