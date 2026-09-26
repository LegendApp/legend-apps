#import <AppKit/AppKit.h>

// Preserve keyboard events while Fabric replaces the source block's editor.
@interface LEMarkdownKeyboardHandoff : NSObject
- (void)beginFromBlock:(NSString *)blockId;
- (BOOL)enqueue:(NSEvent *)event;
- (NSArray<NSEvent *> *)finishAtBlock:(NSString *)blockId;
- (void)cancel;
@end
