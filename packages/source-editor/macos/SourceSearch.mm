#import "SourceSearch.h"
@implementation LESourceSearchResult
@end
LESourceSearchResult *LESearchSource(NSString *source, NSString *query, BOOL regex, BOOL caseSensitive, BOOL wholeWord, BOOL (^cancelled)(void), NSError **error) {
  NSString *pattern = regex ? query : [NSRegularExpression escapedPatternForString:query];
  if (wholeWord) pattern = [NSString stringWithFormat:@"(?<![\\p{L}\\p{N}_])(?:%@)(?![\\p{L}\\p{N}_])", pattern];
  NSRegularExpression *expression = [NSRegularExpression regularExpressionWithPattern:pattern options:caseSensitive ? 0 : NSRegularExpressionCaseInsensitive error:error];
  if (!expression) return nil;
  NSMutableArray *matches = [NSMutableArray new];
  __block BOOL truncated = NO;
  if (query.length) [expression enumerateMatchesInString:source options:NSMatchingReportProgress range:NSMakeRange(0, source.length) usingBlock:^(NSTextCheckingResult *match, NSMatchingFlags flags, BOOL *stop) {
    if (cancelled()) { *stop = YES; return; }
    if (match) {
      if (matches.count == 100000) { truncated = YES; *stop = YES; return; }
      [matches addObject:match];
    }
  }];
  if (cancelled()) return nil;
  LESourceSearchResult *result = [LESourceSearchResult new];
  result.matches = matches; result.expression = expression; result.truncated = truncated;
  return result;
}
