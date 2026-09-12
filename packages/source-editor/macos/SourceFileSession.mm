#import "SourceFileSession.h"

@interface LESourceFileSession ()
@property (atomic, copy, readwrite) NSString *path;
@end

@implementation LESourceFileSession {
  NSDictionary *_signature;
}
+ (NSDictionary *)signatureAtPath:(NSString *)path {
  NSDictionary *attributes = [NSFileManager.defaultManager attributesOfItemAtPath:path.stringByResolvingSymlinksInPath error:nil];
  if (!attributes) return nil;
  return @{ @"modified": attributes[NSFileModificationDate], @"created": attributes[NSFileCreationDate],
    @"size": attributes[NSFileSize], @"inode": attributes[NSFileSystemFileNumber] };
}
- (instancetype)initWithPath:(NSString *)path signature:(NSDictionary *)signature hasBOM:(BOOL)hasBOM {
  if ((self = [super init])) { _path = [path copy]; _signature = [signature copy]; _hasBOM = hasBOM; }
  return self;
}
- (BOOL)hasExternalChanges { return ![_signature isEqual:[LESourceFileSession signatureAtPath:_path]]; }
- (BOOL)writeSource:(NSString *)source toPath:(NSString *)path error:(NSError **)error {
  NSString *target = path.stringByResolvingSymlinksInPath;
  const BOOL sameFile = [target isEqual:_path.stringByResolvingSymlinksInPath];
  NSDictionary *expected = sameFile ? _signature : [LESourceFileSession signatureAtPath:target];
  NSString *encoded = _hasBOM ? [@"\uFEFF" stringByAppendingString:source] : source;
  NSData *data = [encoded dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
  if (!data) { if (error) *error = [NSError errorWithDomain:@"SourceFile" code:1 userInfo:@{NSLocalizedDescriptionKey:@"The document contains invalid Unicode and cannot be saved losslessly."}]; return NO; }
  __block BOOL saved = NO;
  __block NSError *failure = nil;
  NSError *coordinationError = nil;
  NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
  [coordinator coordinateWritingItemAtURL:[NSURL fileURLWithPath:target] options:NSFileCoordinatorWritingForReplacing error:&coordinationError byAccessor:^(NSURL *url) {
    NSDictionary *current = [LESourceFileSession signatureAtPath:target];
    if ((expected || current) && ![expected isEqual:current]) {
      failure = [NSError errorWithDomain:@"SourceFile" code:2 userInfo:@{NSLocalizedDescriptionKey:@"The file changed outside the editor. Your edits are intact. Use Save As to save a separate copy."}];
      return;
    }
    NSDictionary *attributes = [NSFileManager.defaultManager attributesOfItemAtPath:target error:nil];
    NSNumber *permissions = attributes[NSFilePosixPermissions];
    saved = [data writeToURL:url options:NSDataWritingAtomic error:&failure];
    if (saved && permissions) [NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:permissions} ofItemAtPath:target error:nil];
  }];
  if (saved) { self.path = path; _signature = [LESourceFileSession signatureAtPath:path]; }
  if (!saved && error) *error = failure ?: coordinationError ?: [NSError errorWithDomain:@"SourceFile" code:3 userInfo:@{NSLocalizedDescriptionKey:@"Unable to save the document."}];
  return saved;
}
@end
