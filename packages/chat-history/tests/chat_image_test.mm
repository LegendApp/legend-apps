#include "../cpp/ChatImageDimensions.hpp"

#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>

#include <iostream>
#include <stdexcept>

using namespace margelo::nitro::legendapps::chathistory;

static void expect(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

static void writeImage(NSURL *url, CFStringRef type, int orientation) {
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(nullptr, 40, 20, 8, 0, colorSpace, kCGImageAlphaPremultipliedLast);
  CGImageRef image = CGBitmapContextCreateImage(context);
  CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)url, type, 1, nullptr);
  NSDictionary *properties = @{(__bridge NSString *)kCGImagePropertyOrientation: @(orientation)};
  CGImageDestinationAddImage(destination, image, (__bridge CFDictionaryRef)properties);
  expect(CGImageDestinationFinalize(destination), "Image fixture should be written");
  CFRelease(destination);
  CGImageRelease(image);
  CGContextRelease(context);
  CGColorSpaceRelease(colorSpace);
}

int main() {
  @autoreleasepool {
    NSURL *directory = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
    [NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
    int exitCode = 0;
    try {
      NSURL *png = [directory URLByAppendingPathComponent:@"image with space.png"];
      writeImage(png, CFSTR("public.png"), 1);
      auto local = readChatImageDimensions(png.path.UTF8String);
      expect(local && local->width == 40 && local->height == 20, "Local PNG dimensions should be available synchronously");
      auto fileURL = readChatImageDimensions(png.absoluteString.UTF8String);
      expect(fileURL && fileURL->width == 40 && fileURL->height == 20, "Escaped file URLs must work");

      NSURL *jpeg = [directory URLByAppendingPathComponent:@"rotated.jpg"];
      writeImage(jpeg, CFSTR("public.jpeg"), 6);
      auto rotated = readChatImageDimensions(jpeg.path.UTF8String);
      expect(rotated && rotated->width == 20 && rotated->height == 40, "EXIF orientation must match displayed geometry");

      NSString *inlineImage = [@"data:image/png;base64," stringByAppendingString:[[NSData dataWithContentsOfURL:png] base64EncodedStringWithOptions:0]];
      auto embedded = readChatImageDimensions(inlineImage.UTF8String);
      expect(embedded && embedded->width == 40 && embedded->height == 20, "Small inline images should expose dimensions");
      expect(!readChatImageDimensions("https://127.0.0.1:1/no-network.png"), "Remote images must not perform synchronous network access");
      expect(!readChatImageDimensions("file://remote-host/image.png"), "Remote file hosts must not be opened");
      expect(!readChatImageDimensions("/missing/chat-image.png"), "Missing images should use fallback geometry");
      expect(!readChatImageDimensions("data:image/png;base64,invalid"), "Invalid images should use fallback geometry");
      [@"invalid" writeToURL:png atomically:YES encoding:NSUTF8StringEncoding error:nil];
      expect(!readChatImageDimensions(png.path.UTF8String), "Dimensions must be reread, not cached across requests");
      std::cout << "chat image metadata tests passed\n";
    } catch (const std::exception& error) {
      std::cerr << error.what() << '\n';
      exitCode = 1;
    }
    [NSFileManager.defaultManager removeItemAtURL:directory error:nil];
    return exitCode;
  }
}
