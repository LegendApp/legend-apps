#import <React/RCTConvert.h>
#import <React/RCTViewManager.h>
#import <AppKit/AppKit.h>

@interface GlassEffectView : NSView
@property (nonatomic, strong) NSColor *tintColor;
@end

@interface RCT_EXTERN_MODULE(RNGlassEffectView, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(glassStyle, NSString)
RCT_CUSTOM_VIEW_PROPERTY(tintColor, NSColor, GlassEffectView)
{
  if (json) {
    NSString *hexString = nil;

    if ([json isKindOfClass:[NSString class]]) {
      hexString = json;
      hexString = [hexString stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
      unsigned int colorCode = 0;

      if ([hexString hasPrefix:@"#"]) {
        NSString *colorStr = [hexString substringFromIndex:1];
        NSScanner *scanner = [NSScanner scannerWithString:colorStr];
        [scanner scanHexInt:&colorCode];

        CGFloat red, green, blue, alpha;
        alpha = 1.0;

        if (colorStr.length == 3) {
          red = ((colorCode >> 8) & 0xF) / 15.0;
          green = ((colorCode >> 4) & 0xF) / 15.0;
          blue = (colorCode & 0xF) / 15.0;
        } else if (colorStr.length == 4) {
          red = ((colorCode >> 12) & 0xF) / 15.0;
          green = ((colorCode >> 8) & 0xF) / 15.0;
          blue = ((colorCode >> 4) & 0xF) / 15.0;
          alpha = (colorCode & 0xF) / 15.0;
        } else if (colorStr.length == 6) {
          red = ((colorCode >> 16) & 0xFF) / 255.0;
          green = ((colorCode >> 8) & 0xFF) / 255.0;
          blue = (colorCode & 0xFF) / 255.0;
        } else {
          red = ((colorCode >> 24) & 0xFF) / 255.0;
          green = ((colorCode >> 16) & 0xFF) / 255.0;
          blue = ((colorCode >> 8) & 0xFF) / 255.0;
          alpha = (colorCode & 0xFF) / 255.0;
        }

        view.tintColor = [NSColor colorWithSRGBRed:red green:green blue:blue alpha:alpha];
      }
    } else if ([json isKindOfClass:[NSDictionary class]]) {
      NSDictionary *colorDict = (NSDictionary *)json;
      NSNumber *r = colorDict[@"r"] ?: @0;
      NSNumber *g = colorDict[@"g"] ?: @0;
      NSNumber *b = colorDict[@"b"] ?: @0;
      NSNumber *a = colorDict[@"a"] ?: @1;

      CGFloat red = [r floatValue] / 255.0;
      CGFloat green = [g floatValue] / 255.0;
      CGFloat blue = [b floatValue] / 255.0;
      CGFloat alpha = [a floatValue];

      view.tintColor = [NSColor colorWithSRGBRed:red green:green blue:blue alpha:alpha];
    } else {
      view.tintColor = [RCTConvert NSColor:json];
    }
  } else {
    view.tintColor = nil;
  }
}

@end
