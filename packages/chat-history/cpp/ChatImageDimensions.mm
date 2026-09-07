#include "ChatImageDimensions.hpp"

#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>

#include <cmath>

namespace margelo::nitro::legendapps::chathistory {

std::optional<ChatImageDimensions> readChatImageDimensions(const std::string& source) {
  @autoreleasepool {
    NSString *text = [[NSString alloc] initWithBytes:source.data() length:source.size() encoding:NSUTF8StringEncoding];
    NSDictionary *options = @{(__bridge NSString *)kCGImageSourceShouldCache: @NO};
    CGImageSourceRef image = nullptr;
    if ([text hasPrefix:@"data:image/"] && source.size() <= 8 * 1024) {
      NSRange separator = [text rangeOfString:@";base64,"];
      if (separator.location != NSNotFound) {
        NSData *data = [[NSData alloc] initWithBase64EncodedString:[text substringFromIndex:NSMaxRange(separator)] options:0];
        if (data) {
          image = CGImageSourceCreateWithData((__bridge CFDataRef)data, (__bridge CFDictionaryRef)options);
        }
      }
    } else {
      NSURL *url = text.isAbsolutePath ? [NSURL fileURLWithPath:text] : [NSURL URLWithString:text];
      if (url.isFileURL && (url.host.length == 0 || [url.host isEqualToString:@"localhost"])) {
        image = CGImageSourceCreateWithURL((__bridge CFURLRef)url, (__bridge CFDictionaryRef)options);
      }
    }
    std::optional<ChatImageDimensions> dimensions;
    if (image) {
      NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(image, 0, (__bridge CFDictionaryRef)options));
      double width = [properties[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue];
      double height = [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
      int orientation = [properties[(__bridge NSString *)kCGImagePropertyOrientation] intValue];
      if (std::isfinite(width) && std::isfinite(height) && width > 0 && height > 0) {
        dimensions = orientation >= 5 && orientation <= 8
            ? ChatImageDimensions{height, width}
            : ChatImageDimensions{width, height};
      }
      CFRelease(image);
    }
    return dimensions;
  }
}

} // namespace margelo::nitro::legendapps::chathistory
