#import <Foundation/Foundation.h>

// Empty list markers are omitted by the rich-text serializer. Use the editor's
// actual list depth, so an empty nested item still follows normal outdenting.
static inline NSString *LEMarkdownListBeforeExit(NSString *before, NSString *after, NSInteger listDepth) {
  if (listDepth != 0 || after.length != 0 || ![before hasSuffix:@"\n"]) return nil;
  return [before substringToIndex:before.length - 1];
}
