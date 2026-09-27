#import <AppKit/AppKit.h>
#include <cassert>

@class RNMarkdownBlockActivationView;
@interface RNMarkdownEditorHost : NSView
@property NSMutableSet *registered;
@property NSUInteger registrations;
- (void)registerActivationView:(RNMarkdownBlockActivationView *)view;
- (void)unregisterActivationView:(RNMarkdownBlockActivationView *)view;
@end
@implementation RNMarkdownEditorHost
- (instancetype)init { if ((self = [super init])) _registered = [NSMutableSet new]; return self; }
- (void)registerActivationView:(RNMarkdownBlockActivationView *)view { [_registered addObject:view]; _registrations++; }
- (void)unregisterActivationView:(RNMarkdownBlockActivationView *)view { [_registered removeObject:view]; }
@end

@interface RNMarkdownBlockActivationView : NSView {
  NSString *_registeredBlockId;
  __weak RNMarkdownEditorHost *_registeredHost;
}
@property NSString *blockId;
- (void)unregisterFromHost;
- (void)registerWithHostIfNeeded;
@end
@implementation RNMarkdownBlockActivationView
// Compile the production lifecycle methods against a minimal AppKit host.
#include "ActivationLifecycle.inc"
@end

int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 400, 400)
      styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    RNMarkdownEditorHost *host = [RNMarkdownEditorHost new];
    window.contentView = host;
    NSView *wrapper = [NSView new];
    RNMarkdownBlockActivationView *row = [RNMarkdownBlockActivationView new];
    row.blockId = @"paragraph";
    [wrapper addSubview:row];
    assert(host.registered.count == 0);
    // Fabric builds a detached subtree before mounting its outer wrapper.
    [host addSubview:wrapper];
    assert([host.registered containsObject:row]);
    [row registerWithHostIfNeeded];
    assert(host.registrations == 1);
    [wrapper removeFromSuperview];
    assert(host.registered.count == 0);
    [host addSubview:wrapper];
    assert([host.registered containsObject:row]);
    RNMarkdownEditorHost *secondHost = [RNMarkdownEditorHost new];
    [host addSubview:secondHost];
    [secondHost addSubview:wrapper];
    assert(![host.registered containsObject:row]);
    assert([secondHost.registered containsObject:row]);
    [row removeFromSuperview];
    assert(secondHost.registered.count == 0);
    NSLog(@"PASS detached subtree mount, detach, remount, host transfer, idempotency, and direct row removal");
  }
}
