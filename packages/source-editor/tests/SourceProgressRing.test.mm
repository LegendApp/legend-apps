#import "../macos/SourceProgressRing.h"
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#include <cassert>
#include <cmath>
#include <vector>

int main(int argc, const char **argv) {
  @autoreleasepool {
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    std::vector<unsigned char> pixels(20 * 20 * 4);
    CGContextRef context = CGBitmapContextCreate(pixels.data(), 20, 20, 8, 80, space, kCGImageAlphaPremultipliedLast);
    assert(context);
    CGContextTranslateCTM(context, 0, 20); CGContextScaleCTM(context, 1, -1);
    auto alpha = [&](int x, int y) { return pixels[(y * 20 + x) * 4 + 3]; };
    for (double progress : {0.0, 0.25, 0.5, 0.75, 0.99, 1.0}) {
      CGContextClearRect(context, CGRectMake(0, 0, 20, 20));
      LEDrawSourceProgressRing(context, CGRectMake(0, 0, 20, 20), progress);
      // The center and outermost pixels must remain transparent at every value.
      for (int y = 7; y <= 12; ++y) for (int x = 7; x <= 12; ++x) assert(alpha(x, y) == 0);
      for (int i = 0; i < 20; ++i) assert(alpha(0, i) == 0 && alpha(19, i) == 0 && alpha(i, 0) == 0 && alpha(i, 19) == 0);
      // Samples halfway through each quadrant distinguish clockwise arcs from
      // a rising fill, a pie, or a counterclockwise stroke.
      const int x[] = {15, 15, 4, 4}, y[] = {4, 15, 15, 4};
      for (int quadrant = 0; quadrant < 4; ++quadrant) {
        const auto value = alpha(x[quadrant], y[quadrant]);
        assert(value > 0); // Muted track always present.
        if (progress > (quadrant + 0.5) / 4) assert(value > 180);
        else assert(value < 100);
      }
    }
    CGContextClearRect(context, CGRectMake(0, 0, 20, 20));
    LEDrawSourceProgressRing(context, CGRectMake(0, 4, 20, 12), 1);
    // Nonsquare layout still yields a centered circle, not a stretched oval.
    for (int y = 0; y < 20; ++y) for (int x = 0; x < 4; ++x) assert(alpha(x, y) == 0 && alpha(19 - x, y) == 0);
    CGContextRelease(context);

    if (argc > 1) {
      // Optional visual artifact of the same native drawing routine at 3x.
      const int width = 240, height = 52, scale = 3;
      CGContextRef preview = CGBitmapContextCreate(nullptr, width * scale, height * scale, 8, width * scale * 4, space, kCGImageAlphaPremultipliedLast);
      CGContextScaleCTM(preview, scale, scale);
      CGContextSetRGBFillColor(preview, 0.12, 0.12, 0.12, 1);
      CGContextFillRect(preview, CGRectMake(0, 0, width, height));
      CGContextTranslateCTM(preview, 0, height); CGContextScaleCTM(preview, 1, -1);
      const double values[] = {0, 0.25, 0.5, 0.75, 0.99};
      for (int i = 0; i < 5; ++i) LEDrawSourceProgressRing(preview, CGRectMake(16 + i * 46, 16, 20, 20), values[i]);
      CGImageRef image = CGBitmapContextCreateImage(preview);
      NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
      CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)url, CFSTR("public.png"), 1, nullptr);
      CGImageDestinationAddImage(destination, image, nullptr); assert(CGImageDestinationFinalize(destination));
      CFRelease(destination); CGImageRelease(image); CGContextRelease(preview);
    }
    CGColorSpaceRelease(space);
    puts("Progress ring: hollow center, clockwise quadrants, inset stroke and nonsquare bounds passed");
  }
}
