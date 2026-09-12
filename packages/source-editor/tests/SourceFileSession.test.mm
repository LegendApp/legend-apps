#import "../macos/SourceFileSession.h"
#include <cassert>
#include <iostream>
int main() { @autoreleasepool {
  NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
  assert([NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil]);
  NSString *path = [directory stringByAppendingPathComponent:@"deck.txt"];
  assert([@"\uFEFFhello\r\n" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
  auto *session = [[LESourceFileSession alloc] initWithPath:path signature:[LESourceFileSession signatureAtPath:path] hasBOM:YES];
  NSError *error = nil;
  assert([session writeSource:@"👋 edited\r\n" toPath:path error:&error]);
  NSData *bytes = [NSData dataWithContentsOfFile:path];
  assert([bytes isEqual:[@"\uFEFF👋 edited\r\n" dataUsingEncoding:NSUTF8StringEncoding]]);
  assert(!session.hasExternalChanges);
  assert([@"external" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
  assert(session.hasExternalChanges);
  assert(![session writeSource:@"do not overwrite" toPath:path error:&error]);
  assert(error.code == 2 && [error.localizedDescription containsString:@"changed outside the editor"]);
  assert(error && [[NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil] isEqual:@"external"]);
  NSString *copy = [directory stringByAppendingPathComponent:@"copy.txt"];
  assert([session writeSource:@"saved copy\n" toPath:copy error:&error]);
  assert([session.path isEqual:copy] && !session.hasExternalChanges);
  assert(![session writeSource:@"lost" toPath:[directory stringByAppendingPathComponent:@"absent/fail.txt"] error:&error]);
  assert([session.path isEqual:copy]);
  assert([NSFileManager.defaultManager removeItemAtPath:directory error:nil]);
  std::cout << "File sessions: BOM/CRLF/Unicode, conflict refusal, Save As and failure preservation passed\n";
} }
