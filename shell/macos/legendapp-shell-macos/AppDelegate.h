#import <RCTAppDelegate.h>
#import <Cocoa/Cocoa.h>

@interface AppDelegate : RCTAppDelegate <NSWindowDelegate>

@property (nonatomic, assign) BOOL mainWindowFrameAdjusted;
@property (nonatomic, strong) NSView *musicGlassContentView;
@property (nonatomic, strong) NSViewController *musicRootViewController;

@end
