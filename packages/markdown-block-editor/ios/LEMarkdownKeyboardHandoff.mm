#import "LEMarkdownKeyboardHandoff.h"

@implementation LEMarkdownKeyboardHandoff {
  NSString *_sourceBlockId;
  NSMutableArray<NSEvent *> *_events;
}
- (void)beginFromBlock:(NSString *)blockId {
  _sourceBlockId = [blockId copy];
  _events = [NSMutableArray new];
}
- (BOOL)enqueue:(NSEvent *)event {
  if (_sourceBlockId == nil) return NO;
  [_events addObject:event];
  return YES;
}
- (NSArray<NSEvent *> *)finishAtBlock:(NSString *)blockId {
  // The old editor can still finish a scheduled focus effect after Enter.
  if (_sourceBlockId == nil || [_sourceBlockId isEqualToString:blockId]) return @[];
  NSArray *events = [_events copy];
  [self cancel];
  return events;
}
- (void)cancel {
  _sourceBlockId = nil;
  _events = nil;
}
@end
