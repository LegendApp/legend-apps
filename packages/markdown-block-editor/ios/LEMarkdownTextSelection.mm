#import "LEMarkdownTextSelection.h"

@implementation LEMarkdownSelectionBlock
@end

static NSUInteger textLength(LEMarkdownSelectionBlock *block) {
  NSUInteger length = 0;
  for (NSTextView *view in block.textViews) length += view.string.length;
  return length;
}
static NSString *fragment(LEMarkdownSelectionBlock *block, NSRange range) {
  NSUInteger length = textLength(block);
  range.location = MIN(range.location, length);
  range.length = MIN(range.length, length - range.location);
  if (!range.length) return @"";
  return block.markdownForRange(range);
}
static NSDictionary *endpoint(LEMarkdownSelectionBlock *block, NSUInteger offset) {
  offset = MIN(offset, textLength(block));
  return @{ @"blockId": block.blockId, @"index": @(block.index), @"offset": @(offset),
    @"beforeMarkdown": fragment(block, NSMakeRange(0, offset)),
    @"afterMarkdown": fragment(block, NSMakeRange(offset, textLength(block) - offset)) };
}
static NSPoint textOrigin(NSTextView *view) { return view.textContainerOrigin; }
static NSPoint pointForOffset(LEMarkdownSelectionBlock *block, NSUInteger offset) {
  NSTextView *view = block.textViews.lastObject;
  for (NSTextView *candidate in block.textViews) {
    if (offset <= candidate.string.length || candidate == block.textViews.lastObject) { view = candidate; break; }
    offset -= candidate.string.length;
  }
  [view.layoutManager ensureLayoutForTextContainer:view.textContainer];
  NSPoint point = view.textContainerOrigin;
  if (view.layoutManager.numberOfGlyphs) {
    NSUInteger character = MIN(offset, view.string.length - 1);
    NSUInteger glyph = [view.layoutManager glyphIndexForCharacterAtIndex:character];
    NSRect rect = [view.layoutManager boundingRectForGlyphRange:NSMakeRange(glyph, 1) inTextContainer:view.textContainer];
    point.x += offset >= view.string.length ? NSMaxX(rect) : NSMinX(rect);
    point.y += NSMidY(rect);
  }
  return [view convertPoint:point toView:nil];
}
static NSUInteger hitOffset(LEMarkdownSelectionBlock *block, NSPoint windowPoint) {
  NSUInteger base = 0, bestOffset = 0;
  CGFloat bestDistance = CGFLOAT_MAX;
  for (NSTextView *view in block.textViews) {
    NSPoint point = [view convertPoint:windowPoint fromView:nil];
    CGFloat distance = MAX(-point.y, MAX(point.y - NSHeight(view.bounds), 0));
    if (distance < bestDistance) {
      bestDistance = distance;
      NSPoint origin = textOrigin(view);
      point.x -= origin.x; point.y -= origin.y;
      [view.layoutManager ensureLayoutForTextContainer:view.textContainer];
      CGFloat fraction = 0;
      NSUInteger offset = [view.layoutManager characterIndexForPoint:point inTextContainer:view.textContainer fractionOfDistanceBetweenInsertionPoints:&fraction];
      if (offset < view.string.length) {
        NSRange composed = [view.string rangeOfComposedCharacterSequenceAtIndex:offset];
        if (offset != composed.location) offset = fraction < 0.5 ? composed.location : NSMaxRange(composed);
      }
      bestOffset = base + MIN(offset, view.string.length);
    }
    base += view.string.length;
  }
  return bestOffset;
}

@interface LESelectionOverlay : NSView
@property (nonatomic, copy) NSArray<NSValue *> *rects;
@end
@implementation LESelectionOverlay
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)drawRect:(NSRect)dirty {
  [[NSColor.selectedTextBackgroundColor colorWithAlphaComponent:0.4] setFill];
  for (NSValue *rect in self.rects) NSRectFill(rect.rectValue);
}
@end

@implementation LEMarkdownTextSelection {
  __weak NSView *_host;
  __weak NSScrollView *_scroll;
  LESelectionOverlay *_overlay;
  NSDictionary *_anchor, *_focus;
  BOOL _selecting, _dragging, _moved, _anchorResolved;
  NSPoint _pointer, _anchorPoint;
  NSTimer *_timer;
  id _monitor, _resignObserver, _scrollObserver;
  NSInteger _pendingDirection;
  CGFloat _preferredWindowX;
}
- (instancetype)initWithHost:(NSView *)host {
  if ((self = [super init])) {
    _host = host;
    _preferredWindowX = NAN;
    _overlay = [[LESelectionOverlay alloc] initWithFrame:host.bounds];
    _overlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    __weak LEMarkdownTextSelection *weakSelf = self;
    _monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown | NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp | NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
      return [weakSelf handleEvent:event] ?: (weakSelf ? nil : event);
    }];
    _resignObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowDidResignKeyNotification object:nil queue:nil usingBlock:^(NSNotification *note) {
      LEMarkdownTextSelection *self = weakSelf;
      if (self && note.object == self->_host.window) {
        BOOL wasDragging = self->_dragging;
        [self stopDrag];
        if (wasDragging && self->_selecting) [self publish];
      }
    }];
  }
  return self;
}
- (void)dealloc { [self invalidate]; }
- (void)invalidate {
  [self stopDrag];
  if (_monitor) { [NSEvent removeMonitor:_monitor]; _monitor = nil; }
  if (_resignObserver) { [NSNotificationCenter.defaultCenter removeObserver:_resignObserver]; _resignObserver = nil; }
  if (_scrollObserver) { [NSNotificationCenter.defaultCenter removeObserver:_scrollObserver]; _scrollObserver = nil; }
  [_overlay removeFromSuperview];
}
- (NSArray<LEMarkdownSelectionBlock *> *)currentBlocks { return self.blocks ? self.blocks() : @[]; }
- (LEMarkdownSelectionBlock *)blockWithId:(NSString *)blockId {
  for (LEMarkdownSelectionBlock *block in [self currentBlocks]) if ([block.blockId isEqual:blockId]) return block;
  return nil;
}
- (LEMarkdownSelectionBlock *)blockAtPoint:(NSPoint)point {
  LEMarkdownSelectionBlock *nearest = nil;
  CGFloat distance = CGFLOAT_MAX;
  for (LEMarkdownSelectionBlock *block in [self currentBlocks]) {
    NSRect rect = [block.view convertRect:block.view.bounds toView:nil];
    CGFloat d = MAX(NSMinY(rect) - point.y, MAX(point.y - NSMaxY(rect), 0));
    if (d < distance) { nearest = block; distance = d; }
  }
  return nearest;
}
- (void)stopDrag { _dragging = NO; [_timer invalidate]; _timer = nil; }
- (BOOL)hasSelection { return _selecting; }
- (void)observeScroll:(NSScrollView *)scroll {
  if (_scroll == scroll && _scrollObserver) return;
  if (_scrollObserver) [NSNotificationCenter.defaultCenter removeObserver:_scrollObserver];
  _scroll = scroll;
  _scrollObserver = nil;
  if (!scroll) return;
  scroll.contentView.postsBoundsChangedNotifications = YES;
  __weak LEMarkdownTextSelection *weakSelf = self;
  _scrollObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSViewBoundsDidChangeNotification object:scroll.contentView queue:nil usingBlock:^(NSNotification *note) {
    [weakSelf refresh];
  }];
}
- (void)setSelectionJSON:(NSString *)json {
  if (_dragging) return; // Delayed React echoes cannot rewind an active gesture.
  if (!json.length) {
    _selecting = NO; _anchor = _focus = nil; _pendingDirection = 0; _preferredWindowX = NAN;
  } else {
    NSDictionary *value = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    if ([value[@"anchor"] isKindOfClass:NSDictionary.class] && [value[@"focus"] isKindOfClass:NSDictionary.class]) {
      _anchor = value[@"anchor"]; _focus = value[@"focus"]; _selecting = YES;
    }
  }
  [self refresh];
}
- (void)publish {
  if (!_anchor || !_focus) return;
  NSString *same = @"";
  if ([_anchor[@"blockId"] isEqual:_focus[@"blockId"]]) {
    LEMarkdownSelectionBlock *block = [self blockWithId:_anchor[@"blockId"]];
    NSUInteger a = [_anchor[@"offset"] unsignedIntegerValue], b = [_focus[@"offset"] unsignedIntegerValue];
    if (block) same = fragment(block, NSMakeRange(MIN(a, b), MAX(a, b) - MIN(a, b)));
  }
  NSDictionary *value = @{ @"anchor": _anchor, @"focus": _focus, @"sameBlockMarkdown": same };
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  if (self.onChange) self.onChange([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding], _dragging);
  [self refresh];
}
- (void)collapseToEndpoint:(NSDictionary *)position {
  LEMarkdownSelectionBlock *block = [self blockWithId:position[@"blockId"]];
  if (!block) return;
  NSPoint point = pointForOffset(block, [position[@"offset"] unsignedIntegerValue]);
  [self setSelectionJSON:@""];
  if (self.onChange) self.onChange(@"", NO);
  if (self.onCollapse) self.onCollapse(block.blockId, point);
}
- (NSEvent *)handleEvent:(NSEvent *)event {
  if (!_host.window || event.window != _host.window) return event;
  if (event.type == NSEventTypeLeftMouseDown) {
    [self stopDrag];
    if (!NSPointInRect([_host convertPoint:event.locationInWindow fromView:nil], _host.bounds)) return event;
    LEMarkdownSelectionBlock *block = [self blockAtPoint:event.locationInWindow];
    if (!block || !NSPointInRect([block.view convertPoint:event.locationInWindow fromView:nil], block.view.bounds)) return event;
    BOOL hadSelection = _selecting;
    [self setSelectionJSON:@""];
    if (hadSelection && self.onChange) self.onChange(@"", NO);
    _anchor = endpoint(block, hitOffset(block, event.locationInWindow)); _focus = _anchor;
    _selecting = NO; _dragging = YES; _moved = NO; _pendingDirection = 0; _preferredWindowX = NAN;
    [self observeScroll:block.view.enclosingScrollView]; _pointer = event.locationInWindow;
    _anchorPoint = [block.view convertPoint:event.locationInWindow fromView:nil];
    _anchorResolved = block.input != nil;
    __weak LEMarkdownTextSelection *weakSelf = self;
    _timer = [NSTimer timerWithTimeInterval:0.016 repeats:YES block:^(NSTimer *timer) { [weakSelf dragTick]; }];
    [NSRunLoop.mainRunLoop addTimer:_timer forMode:NSRunLoopCommonModes];
    [NSRunLoop.mainRunLoop addTimer:_timer forMode:NSEventTrackingRunLoopMode];
    [self refresh];
  } else if (event.type == NSEventTypeLeftMouseDragged && _dragging) {
    _moved = YES; _pointer = event.locationInWindow; [self updateDrag];
    if (_selecting) return nil;
  } else if (event.type == NSEventTypeLeftMouseUp && _dragging) {
    BOOL selected = _selecting;
    [self stopDrag]; if (selected) { [self publish]; return nil; }
  } else if (event.type == NSEventTypeKeyDown) {
    NSResponder *responder = _host.window.firstResponder;
    if (![responder isKindOfClass:NSView.class] || ![(NSView *)responder isDescendantOf:_host]) return event;
    if ((event.modifierFlags & (NSEventModifierFlagShift | NSEventModifierFlagCommand | NSEventModifierFlagOption | NSEventModifierFlagControl)) == NSEventModifierFlagShift && (event.keyCode == 125 || event.keyCode == 126)) {
      if ([self moveVertically:event.keyCode == 126 ? -1 : 1]) return nil;
    } else if (!_selecting) {
      _anchor = _focus = nil; _pendingDirection = 0; _preferredWindowX = NAN;
    }
    if (_selecting) {
      if (event.keyCode == 53) { [self collapseToEndpoint:_focus]; return nil; }
      if (event.keyCode >= 123 && event.keyCode <= 126 && !(event.modifierFlags & (NSEventModifierFlagShift | NSEventModifierFlagCommand | NSEventModifierFlagOption | NSEventModifierFlagControl))) {
        NSInteger a = [_anchor[@"index"] integerValue], b = [_focus[@"index"] integerValue];
        BOOL forward = a < b || (a == b && [_anchor[@"offset"] integerValue] <= [_focus[@"offset"] integerValue]);
        BOOL end = event.keyCode == 124 || event.keyCode == 125;
        [self collapseToEndpoint:end == forward ? _focus : _anchor];
        return nil;
      }
      if (event.modifierFlags & NSEventModifierFlagCommand) {
        NSString *key = event.charactersIgnoringModifiers.lowercaseString;
        if ([@[@"c", @"x", @"v"] containsObject:key]) { if (self.onAction) self.onAction(key); return nil; }
      }
      if (event.keyCode == 51 || event.keyCode == 117) { if (self.onAction) self.onAction(@"delete"); return nil; }
    }
  }
  return event;
}
- (void)dragTick {
  if (!_dragging || !_host.window) { [self stopDrag]; return; }
  if (!(NSEvent.pressedMouseButtons & 1)) { [self stopDrag]; if (_selecting) [self publish]; return; }
  NSPoint point = _host.window.mouseLocationOutsideOfEventStream;
  if (!NSEqualPoints(point, _pointer)) _moved = YES;
  _pointer = point;
  if (_moved) [self updateDrag];
}
- (void)updateDrag {
  if (!_anchorResolved) {
    // A click can mount the editable layout asynchronously. Keep the original
    // row-local point so scrolling cannot move the anchor to another line.
    LEMarkdownSelectionBlock *block = [self blockWithId:_anchor[@"blockId"]];
    if (block.input) {
      _anchor = endpoint(block, hitOffset(block, [block.view convertPoint:_anchorPoint toView:nil]));
      _anchorResolved = YES;
    }
  }
  NSClipView *clip = _scroll.contentView;
  NSPoint point = clip ? [clip convertPoint:_pointer fromView:nil] : _pointer;
  if (clip) {
    CGFloat outside = point.y < NSMinY(clip.bounds) ? point.y - NSMinY(clip.bounds) : point.y > NSMaxY(clip.bounds) ? point.y - NSMaxY(clip.bounds) : 0;
    if (outside) {
      NSRect bounds = clip.bounds;
      bounds.origin.y += copysign(MIN(32, MAX(2, fabs(outside) * 0.25)), outside);
      [clip scrollToPoint:[clip constrainBoundsRect:bounds].origin]; [_scroll reflectScrolledClipView:clip];
      point = [clip convertPoint:_pointer fromView:nil];
    }
    point.y = MIN(MAX(point.y, NSMinY(clip.bounds)), NSMaxY(clip.bounds) - 0.5);
    point = [clip convertPoint:point toView:nil];
  }
  LEMarkdownSelectionBlock *block = [self blockAtPoint:point];
  if (!block) return;
  NSDictionary *focus = endpoint(block, hitOffset(block, point));
  if (!_selecting && [focus[@"blockId"] isEqual:_anchor[@"blockId"]]) return;
  _selecting = YES;
  if (![_focus isEqual:focus]) { _focus = focus; [self publish]; }
}
- (BOOL)moveVertically:(NSInteger)direction {
  NSArray<LEMarkdownSelectionBlock *> *blocks = [self currentBlocks];
  if (!_selecting && !_pendingDirection) {
    NSDictionary *previousAnchor = _anchor;
    _anchor = _focus = nil;
    for (LEMarkdownSelectionBlock *block in blocks) {
      NSUInteger base = 0;
      for (NSTextView *view in block.textViews) {
      if (_host.window.firstResponder != view) { base += view.string.length; continue; }
      NSRange range = view.selectedRange;
      NSUInteger anchor = direction > 0 ? range.location : NSMaxRange(range);
      NSUInteger focus = direction > 0 ? NSMaxRange(range) : range.location;
      if ([previousAnchor[@"blockId"] isEqual:block.blockId]) {
        NSUInteger previous = [previousAnchor[@"offset"] unsignedIntegerValue];
        if (previous == base + range.location || previous == base + NSMaxRange(range)) {
          anchor = previous - base;
          focus = anchor == range.location ? NSMaxRange(range) : range.location;
        }
      }
      _anchor = endpoint(block, base + anchor); _focus = endpoint(block, base + focus);
      [self observeScroll:block.view.enclosingScrollView];
      base += view.string.length;
      }
    }
    if (!_focus) return NO;
  }
  LEMarkdownSelectionBlock *current = [self blockWithId:_focus[@"blockId"]];
  if (!current || !current.textViews.count) return NO;
  NSUInteger offset = [_focus[@"offset"] unsignedIntegerValue];
  NSTextView *view = current.textViews.lastObject;
  for (NSTextView *candidate in current.textViews) {
    if (offset <= candidate.string.length || candidate == current.textViews.lastObject) { view = candidate; break; }
    offset -= candidate.string.length;
  }
  offset = MIN(offset, view.string.length);
  [view.layoutManager ensureLayoutForTextContainer:view.textContainer];
  NSRange glyphs = [view.layoutManager glyphRangeForCharacterRange:NSMakeRange(offset, 0) actualCharacterRange:nullptr];
  NSUInteger glyph = MIN(glyphs.location, MAX((NSInteger)view.layoutManager.numberOfGlyphs - 1, 0));
  NSRect line = view.layoutManager.numberOfGlyphs ? [view.layoutManager lineFragmentRectForGlyphAtIndex:glyph effectiveRange:nullptr] : NSMakeRect(0, 0, 1, view.font.pointSize * 1.4);
  NSPoint origin = textOrigin(view);
  NSPoint location = view.layoutManager.numberOfGlyphs ? [view.layoutManager locationForGlyphAtIndex:glyph] : NSZeroPoint;
  NSPoint windowPoint = [view convertPoint:NSMakePoint(NSMinX(line) + location.x + origin.x, NSMidY(line) + origin.y) toView:nil];
  if (isnan(_preferredWindowX)) _preferredWindowX = windowPoint.x;
  NSPoint targetLocal = NSMakePoint(0, NSMidY(line) + origin.y + direction * NSHeight(line));
  BOOL crosses = targetLocal.y < origin.y || targetLocal.y >= NSMaxY([view.layoutManager usedRectForTextContainer:view.textContainer]) + origin.y;
  if (!_selecting && !crosses) return NO;
  LEMarkdownSelectionBlock *target = current;
  if (crosses) {
    NSInteger segment = [current.textViews indexOfObject:view] + direction;
    if (segment >= 0 && segment < (NSInteger)current.textViews.count) {
      view = current.textViews[segment];
      targetLocal = NSMakePoint(0, direction < 0 ? NSMaxY([view.layoutManager usedRectForTextContainer:view.textContainer]) + textOrigin(view).y - 0.5 : textOrigin(view).y + 0.5);
      windowPoint = [view convertPoint:targetLocal toView:nil];
    } else {
      target = nil;
      for (LEMarkdownSelectionBlock *candidate in blocks) if (candidate.index == current.index + direction) target = candidate;
      if (!target) {
        NSString *neighbor = direction < 0 ? current.previousBlockId : current.nextBlockId;
        if (neighbor != nil && !neighbor.length) { _pendingDirection = 0; return YES; }
        if (current.index + direction >= 0 && self.onReveal) {
          _pendingDirection = direction; self.onReveal(current.index + direction, direction < 0);
        }
        return YES;
      }
      NSTextView *edge = direction < 0 ? target.textViews.lastObject : target.textViews.firstObject;
      [edge.layoutManager ensureLayoutForTextContainer:edge.textContainer];
      targetLocal = NSMakePoint(0, direction < 0 ? NSMaxY([edge.layoutManager usedRectForTextContainer:edge.textContainer]) + textOrigin(edge).y - 0.5 : textOrigin(edge).y + 0.5);
      windowPoint = [edge convertPoint:targetLocal toView:nil];
    }
  } else windowPoint = [view convertPoint:targetLocal toView:nil];
  windowPoint.x = _preferredWindowX;
  _selecting = YES; _focus = endpoint(target, hitOffset(target, windowPoint)); _pendingDirection = 0;
  [self publish];
  return YES;
}
- (void)refresh {
  if (_pendingDirection) {
    NSInteger targetIndex = [_focus[@"index"] integerValue] + _pendingDirection;
    for (LEMarkdownSelectionBlock *block in [self currentBlocks]) if (block.index == targetIndex) {
      [self moveVertically:_pendingDirection]; break;
    }
  }
  if (!_selecting || !_anchor || !_focus) { _overlay.rects = @[]; _overlay.needsDisplay = YES; return; }
  NSInteger a = [_anchor[@"index"] integerValue], b = [_focus[@"index"] integerValue];
  BOOL forward = a < b || (a == b && [_anchor[@"offset"] integerValue] <= [_focus[@"offset"] integerValue]);
  NSDictionary *start = forward ? _anchor : _focus, *end = forward ? _focus : _anchor;
  NSMutableArray *rects = [NSMutableArray new];
  for (LEMarkdownSelectionBlock *block in [self currentBlocks]) {
    if (block.index < MIN(a, b) || block.index > MAX(a, b)) continue;
    NSUInteger first = [block.blockId isEqual:start[@"blockId"]] ? [start[@"offset"] unsignedIntegerValue] : 0;
    NSUInteger last = [block.blockId isEqual:end[@"blockId"]] ? [end[@"offset"] unsignedIntegerValue] : textLength(block);
    NSUInteger base = 0;
    for (NSTextView *view in block.textViews) {
      NSRange range = NSIntersectionRange(NSMakeRange(first, last >= first ? last - first : 0), NSMakeRange(base, view.string.length));
      base += view.string.length;
      if (!range.length) continue;
      range.location -= base - view.string.length;
      NSRange glyphs = [view.layoutManager glyphRangeForCharacterRange:range actualCharacterRange:nullptr];
      [view.layoutManager enumerateEnclosingRectsForGlyphRange:glyphs withinSelectedGlyphRange:NSMakeRange(NSNotFound, 0) inTextContainer:view.textContainer usingBlock:^(NSRect rect, BOOL *stop) {
        rect.origin.x += textOrigin(view).x; rect.origin.y += textOrigin(view).y;
        [rects addObject:[NSValue valueWithRect:[view convertRect:rect toView:self->_host]]];
      }];
    }
  }
  if (_overlay.superview != _host) [_host addSubview:_overlay positioned:NSWindowAbove relativeTo:nil];
  _overlay.frame = _host.bounds; _overlay.rects = rects; _overlay.needsDisplay = YES;
}
@end
