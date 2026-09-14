#import "RNSourceDocuments.h"
#import "SourceDocumentLoad.h"

@implementation RNSourceDocuments
RCT_EXPORT_MODULE(NativeSourceDocuments)
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeSourceDocumentsSpecJSI>(params);
}
- (NSString *)prepare:(NSString *)path { return [LESourcePreparedDocuments prepare:path]; }
- (NSString *)snapshot:(NSString *)token path:(NSString *)path {
  NSDictionary *metadata = [LESourcePreparedDocuments snapshot:token path:path];
  if (!metadata) return @"";
  NSData *json = [NSJSONSerialization dataWithJSONObject:metadata options:0 error:nil];
  return [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
}
- (void)cancel:(NSString *)token { [LESourcePreparedDocuments cancel:token]; }
@end
