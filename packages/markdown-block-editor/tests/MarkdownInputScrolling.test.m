#import <AppKit/AppKit.h>
#import "ENRMInputScrolling.h"

@interface NotesScrollView : NSScrollView
@property NSUInteger wheelEvents;
@end
@implementation NotesScrollView
- (void)scrollWheel:(NSEvent *)event { ++_wheelEvents; }
@end

static void require(BOOL condition, NSString *message)
{
  if (!condition) { NSLog(@"FAIL %@", message); exit(1); }
}

int main()
{
  @autoreleasepool {
    [NSApplication sharedApplication];
    NotesScrollView *outer = [[NotesScrollView alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
    NSView *document = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 600, 1800)];
    outer.documentView = document;
    NSView *container = [[NSView alloc] initWithFrame:document.bounds];
    [document addSubview:container];
    NSScrollView *inner = [[NSScrollView alloc] initWithFrame:container.bounds];
    NSTextView *text = [[NSTextView alloc] initWithFrame:container.bounds];
    text.string = @"Numbered notes and inactive sections stay in one editable document.";
    text.selectedRange = NSMakeRange(9, 5);
    inner.documentView = text;
    [container addSubview:inner];
    require(text.enclosingScrollView == inner, @"reproduce the former nested notes scroll owner");
    CGEventRef wheel = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitPixel, 1, -120);
    NSEvent *event = [NSEvent eventWithCGEvent:wheel];
    [text scrollWheel:event];
    require(outer.wheelEvents == 0, @"nested input reproduces swallowed wheel events over notes");

    for (NSNumber *enabled in @[@NO, @NO, @YES, @YES, @NO]) {
      ENRMConfigureInputScrolling(container, inner, text, enabled.boolValue);
      require(text.verticallyResizable == enabled.boolValue, @"only a standalone scroll document may resize vertically");
      require(!text.horizontallyResizable, @"wrapping input must keep its assigned width");
      require(NSEqualRanges(text.selectedRange, NSMakeRange(9, 5)), @"changing scroll ownership retains selection");
      require([text.string hasPrefix:@"Numbered notes"], @"changing scroll ownership retains document");
      if (enabled.boolValue) {
        require(text.enclosingScrollView == inner && inner.superview == container, @"standalone input retains native scrolling");
      } else {
        require(text.superview == container && text.enclosingScrollView == outer, @"disabled input uses the outer notes viewport");
        require(inner.superview == nil && inner.documentView == nil, @"disabled input has no hidden scroll owner");
        NSUInteger before = outer.wheelEvents;
        [text scrollWheel:event];
        require(outer.wheelEvents == before + 1, @"wheel events over text reach the outer scroll owner");
        [outer.contentView scrollToPoint:NSMakePoint(0, 500)];
        require(outer.contentView.bounds.origin.y == 500, @"step-following moves the shared viewport");
      }
    }
    // Bright read-only overlays obey the same disabled-scroll contract.
    NSView *highlight = [[NSView alloc] initWithFrame:document.bounds];
    [document addSubview:highlight];
    NSScrollView *highlightScroll = [NSScrollView new];
    NSTextView *highlightText = [[NSTextView alloc] initWithFrame:highlight.bounds];
    highlightText.editable = NO;
    ENRMConfigureInputScrolling(highlight, highlightScroll, highlightText, NO);
    require(highlightText.enclosingScrollView == outer, @"inactive coloring does not introduce another scroll owner");
    NSUInteger before = outer.wheelEvents;
    [highlightText scrollWheel:event];
    require(outer.wheelEvents == before + 1, @"read-only highlight forwards wheel events");
    CFRelease(wheel);
    NSLog(@"PASS notes scroll ownership, wheel routing, selection, and step-following");
  }
  return 0;
}
