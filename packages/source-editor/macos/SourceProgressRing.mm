#import "SourceProgressRing.h"
#include <algorithm>
#include <cmath>

void LEDrawSourceProgressRing(CGContextRef context, CGRect bounds, double progress) {
  const CGFloat diameter = std::min(bounds.size.width, bounds.size.height);
  const CGFloat stroke = 2;
  if (!context || diameter <= stroke + 2) return;
  // Leave an extra pixel beyond the stroke for antialiasing. Even nonsquare
  // transient bounds draw an inscribed circle, never an ellipse or clipped arc.
  const CGFloat radius = (diameter - stroke) / 2 - 1;
  const CGPoint center = CGPointMake(CGRectGetMidX(bounds), CGRectGetMidY(bounds));
  const CGRect track = CGRectMake(center.x - radius, center.y - radius, radius * 2, radius * 2);
  const double fraction = std::isfinite(progress) ? std::clamp(progress, 0.0, 1.0) : 0;
  CGContextSaveGState(context);
  CGContextSetLineWidth(context, stroke);
  CGContextSetRGBStrokeColor(context, 96.0 / 255, 165.0 / 255, 250.0 / 255, 0.25);
  CGContextStrokeEllipseInRect(context, track);
  if (fraction > 0) {
    CGContextSetRGBStrokeColor(context, 96.0 / 255, 165.0 / 255, 250.0 / 255, 1);
    if (fraction == 1) CGContextStrokeEllipseInRect(context, track);
    else {
      CGContextSetLineCap(context, kCGLineCapRound);
      CGContextBeginPath(context);
      CGContextAddArc(context, center.x, center.y, radius, -M_PI_2, -M_PI_2 + fraction * 2 * M_PI, false);
      CGContextStrokePath(context);
    }
  }
  CGContextRestoreGState(context);
}
