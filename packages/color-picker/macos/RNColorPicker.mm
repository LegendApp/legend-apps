#import "RNColorPicker.h"
#import <AppKit/AppKit.h>
@implementation RNColorPicker {
  RCTPromiseResolveBlock _resolve;
  RCTPromiseRejectBlock _reject;
}
RCT_EXPORT_MODULE(NativeColorPicker)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeColorPickerSpecJSI>(params);
}
- (void)showColorPicker:(NSString *)initialColor resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_resolve) { reject(@"E_BUSY", @"Color picker is already open", nil); return; }
    NSString *hex = [initialColor stringByReplacingOccurrencesOfString:@"#" withString:@""];
    if (hex.length == 3) hex = [NSString stringWithFormat:@"%C%C%C%C%C%C", [hex characterAtIndex:0], [hex characterAtIndex:0], [hex characterAtIndex:1], [hex characterAtIndex:1], [hex characterAtIndex:2], [hex characterAtIndex:2]];
    unsigned int rgb = 0;
    [[NSScanner scannerWithString:hex] scanHexInt:&rgb];
    NSColorPanel *panel = NSColorPanel.sharedColorPanel;
    panel.color = [NSColor colorWithSRGBRed:((rgb >> 16) & 255)/255.0 green:((rgb >> 8) & 255)/255.0 blue:(rgb & 255)/255.0 alpha:1];
    panel.showsAlpha = NO;
    self->_resolve = resolve; self->_reject = reject;
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(panelClosed:) name:NSWindowWillCloseNotification object:panel];
    [panel orderFront:nil];
  });
}
- (void)panelClosed:(NSNotification *)notification {
  NSColor *color = [NSColorPanel.sharedColorPanel.color colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
  if (_resolve) _resolve([NSString stringWithFormat:@"#%02X%02X%02X", (int)round(color.redComponent*255), (int)round(color.greenComponent*255), (int)round(color.blueComponent*255)]);
  _resolve = nil; _reject = nil;
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}
- (void)invalidate {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    if (self->_reject) self->_reject(@"E_CANCELLED", @"Color picker closed during reload", nil);
    self->_resolve = nil; self->_reject = nil;
  });
}
@end
