#import <React/RCTViewComponentView.h>
#import <react/renderer/components/RNSourceEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNSourceEditorSpec/Props.h>
#import "SourceProgressRing.h"

using namespace facebook::react;

@interface LESourceProgressRingView : NSView
@property (nonatomic) double progress;
@end
@implementation LESourceProgressRingView
- (BOOL)isFlipped { return YES; }
- (BOOL)isOpaque { return NO; }
- (void)setProgress:(double)progress { _progress = progress; self.needsDisplay = YES; }
- (void)drawRect:(NSRect)dirtyRect {
  LEDrawSourceProgressRing(NSGraphicsContext.currentContext.CGContext, self.bounds, _progress);
}
@end

@interface RNSourceEditorProgressRing : RCTViewComponentView
@end
@implementation RNSourceEditorProgressRing {
  LESourceProgressRingView *_ring;
}
+ (ComponentDescriptorProvider)componentDescriptorProvider { return concreteComponentDescriptorProvider<SourceEditorProgressRingComponentDescriptor>(); }
- (instancetype)init {
  if ((self = [super init])) {
    _props = std::make_shared<const SourceEditorProgressRingProps>();
    _ring = [[LESourceProgressRingView alloc] initWithFrame:self.bounds];
    _ring.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_ring];
  }
  return self;
}
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  _ring.progress = std::static_pointer_cast<const SourceEditorProgressRingProps>(props)->progress;
  [super updateProps:props oldProps:oldProps];
}
- (void)prepareForRecycle { [super prepareForRecycle]; _ring.progress = 0; }
@end

Class<RCTComponentViewProtocol> SourceEditorProgressRingCls(void) { return RNSourceEditorProgressRing.class; }
