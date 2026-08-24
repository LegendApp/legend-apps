#import "RNCommandRunner.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>

#endif

@implementation RNCommandRunner {
  dispatch_queue_t _workQueue;
}

RCT_EXPORT_MODULE(NativeCommandRunner)

- (instancetype)init
{
  self = [super init];
  if (self) {
    _workQueue = dispatch_queue_create("so.legend.apps.command-runner", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeCommandRunnerSpecJSI>(params);
}

- (NSArray *)parseArrayJSON:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @[];
  }

  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:[NSArray class]] ? value : @[];
}

- (NSDictionary *)parseObjectJSON:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @{};
  }

  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:[NSDictionary class]] ? value : @{};
}

- (NSString *)jsonStringFromObject:(id)object
{
  id value = object ?: [NSNull null];
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

- (void)getAvailability:(NSString *)commandsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  NSArray *commands = [self parseArrayJSON:commandsJson];
  NSMutableDictionary<NSString *, NSNumber *> *availability = [NSMutableDictionary dictionaryWithCapacity:commands.count];
  for (id commandValue in commands) {
    if (![commandValue isKindOfClass:[NSString class]]) {
      continue;
    }
    NSString *command = (NSString *)commandValue;
    availability[command] = @([self resolveCommandPath:command] != nil);
  }
  resolve([self jsonStringFromObject:availability]);
#else
  resolve(@"{}");
#endif
}

#if TARGET_OS_OSX
- (NSDictionary *)normalizedCommandFromParams:(NSDictionary *)params
                                     errorCode:(NSString **)errorCode
                                  errorMessage:(NSString **)errorMessage
{
  NSString *command = [params[@"command"] isKindOfClass:[NSString class]] ? params[@"command"] : nil;
  if (command.length == 0) {
    *errorCode = @"missing_command";
    *errorMessage = @"Missing command to execute.";
    return nil;
  }

  NSString *resolvedPath = [self resolveCommandPath:command];
  if (resolvedPath.length == 0) {
    *errorCode = @"command_not_found";
    *errorMessage = [NSString stringWithFormat:@"Command not found: %@", command];
    return nil;
  }

  NSArray *rawArgs = [params[@"args"] isKindOfClass:[NSArray class]] ? params[@"args"] : @[];
  NSMutableArray<NSString *> *args = [NSMutableArray arrayWithCapacity:rawArgs.count];
  for (id arg in rawArgs) {
    if ([arg isKindOfClass:[NSString class]]) {
      [args addObject:arg];
    }
  }

  NSString *input = [params[@"input"] isKindOfClass:[NSString class]] ? params[@"input"] : nil;
  NSString *cwd = [params[@"cwd"] isKindOfClass:[NSString class]] ? params[@"cwd"] : nil;
  NSNumber *timeoutMs = [params[@"timeoutMs"] isKindOfClass:[NSNumber class]] ? params[@"timeoutMs"] : nil;
  return @{
    @"args": args,
    @"cwd": cwd ?: NSNull.null,
    @"input": input ?: NSNull.null,
    @"resolvedPath": resolvedPath,
    @"timeoutMs": timeoutMs ?: NSNull.null,
  };
}

- (NSDictionary *)executeNormalizedCommand:(NSDictionary *)params
                                  errorCode:(NSString **)errorCode
                               errorMessage:(NSString **)errorMessage
                                      error:(NSError **)commandError
{
  NSArray<NSString *> *args = params[@"args"];
  NSString *cwd = [params[@"cwd"] isKindOfClass:NSString.class] ? params[@"cwd"] : nil;
  NSString *input = [params[@"input"] isKindOfClass:NSString.class] ? params[@"input"] : nil;
  NSString *resolvedPath = params[@"resolvedPath"];
  NSNumber *timeoutMs = [params[@"timeoutMs"] isKindOfClass:NSNumber.class] ? params[@"timeoutMs"] : nil;
  NSTask *task = [[NSTask alloc] init];
  task.executableURL = [NSURL fileURLWithPath:resolvedPath];
  task.arguments = args;
  NSMutableDictionary<NSString *, NSString *> *environment =
      [[[NSProcessInfo processInfo] environment] mutableCopy];
  for (NSString *key in @[
         @"CODEX_CI",
         @"CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
         @"CODEX_SESSION_ID",
         @"CODEX_SHELL",
         @"CODEX_THREAD_ID",
       ]) {
    [environment removeObjectForKey:key];
  }
  task.environment = environment;
  if (cwd.length > 0) {
    NSString *expandedCwd = [cwd stringByExpandingTildeInPath];
    BOOL isDirectory = NO;
    BOOL cwdExists = [[NSFileManager defaultManager] fileExistsAtPath:expandedCwd isDirectory:&isDirectory];
    if (!cwdExists || !isDirectory) {
      *errorCode = @"invalid_cwd";
      *errorMessage = [NSString stringWithFormat:@"Working directory not found: %@", cwd];
      return nil;
    }
    task.currentDirectoryURL = [NSURL fileURLWithPath:expandedCwd isDirectory:YES];
  } else {
    task.currentDirectoryURL = [NSURL fileURLWithPath:NSHomeDirectory() isDirectory:YES];
  }

  NSPipe *stdoutPipe = [NSPipe pipe];
  NSPipe *stderrPipe = [NSPipe pipe];
  task.standardOutput = stdoutPipe;
  task.standardError = stderrPipe;

  NSPipe *stdinPipe = nil;
  if (input != nil) {
    stdinPipe = [NSPipe pipe];
    task.standardInput = stdinPipe;
  } else {
    task.standardInput = [NSFileHandle fileHandleWithNullDevice];
  }

  NSError *error = nil;
  BOOL didLaunch = [task launchAndReturnError:&error];
  if (!didLaunch) {
    *errorCode = @"spawn_failed";
    *errorMessage = error.localizedDescription ?: @"Failed to start command.";
    *commandError = error;
    return nil;
  }

  if (input != nil) {
    NSData *inputData = [input dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
    [[stdinPipe fileHandleForWriting] writeData:inputData];
    [[stdinPipe fileHandleForWriting] closeFile];
  }

  dispatch_group_t outputGroup = dispatch_group_create();
  __block NSData *stdoutData = nil;
  __block NSData *stderrData = nil;
  dispatch_group_async(outputGroup, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    stdoutData = [[stdoutPipe fileHandleForReading] readDataToEndOfFile];
  });
  dispatch_group_async(outputGroup, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    stderrData = [[stderrPipe fileHandleForReading] readDataToEndOfFile];
  });

  NSTimeInterval timeoutSeconds = timeoutMs != nil ? timeoutMs.doubleValue / 1000.0 : 0;
  BOOL hasTimeout = timeoutSeconds > 0;
  NSLock *timeoutLock = [[NSLock alloc] init];
  __block BOOL didTimeout = NO;

  if (hasTimeout) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeoutSeconds * NSEC_PER_SEC)),
                   dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      if (task.isRunning) {
        [timeoutLock lock];
        didTimeout = YES;
        [timeoutLock unlock];
        [task terminate];
      }
    });
  }

  [task waitUntilExit];
  dispatch_group_wait(outputGroup, DISPATCH_TIME_FOREVER);
  NSString *stdout = [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding] ?: @"";
  NSString *stderr = [[NSString alloc] initWithData:stderrData encoding:NSUTF8StringEncoding] ?: @"";

  BOOL timedOut = NO;
  if (hasTimeout) {
    [timeoutLock lock];
    timedOut = didTimeout;
    [timeoutLock unlock];
  }

  return @{
    @"stdout": stdout,
    @"stderr": stderr,
    @"exitCode": @(task.terminationStatus),
    @"timedOut": @(timedOut),
  };
}
#endif

- (void)runCommand:(NSString *)paramsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  NSString *errorCode = nil;
  NSString *errorMessage = nil;
  NSDictionary *command = [self normalizedCommandFromParams:[self parseObjectJSON:paramsJson]
                                                   errorCode:&errorCode
                                                errorMessage:&errorMessage];
  if (!command) {
    reject(errorCode, errorMessage, nil);
    return;
  }

  dispatch_async(_workQueue, ^{
    NSString *commandErrorCode = nil;
    NSString *commandErrorMessage = nil;
    NSError *commandError = nil;
    NSDictionary *payload = [self executeNormalizedCommand:command
                                                 errorCode:&commandErrorCode
                                              errorMessage:&commandErrorMessage
                                                     error:&commandError];
    dispatch_async(dispatch_get_main_queue(), ^{
      if (payload) {
        resolve([self jsonStringFromObject:payload]);
      } else {
        reject(commandErrorCode, commandErrorMessage, commandError);
      }
    });
  });
#else
  reject(@"unsupported_platform", @"Command execution is only supported on macOS.", nil);
#endif
}

- (void)runCommands:(NSString *)paramsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  NSArray *params = [self parseArrayJSON:paramsJson];
  NSMutableArray<NSDictionary *> *commands = [NSMutableArray arrayWithCapacity:params.count];
  for (id value in params) {
    if (![value isKindOfClass:NSDictionary.class]) {
      reject(@"invalid_command", @"Invalid command batch entry.", nil);
      return;
    }
    NSString *errorCode = nil;
    NSString *errorMessage = nil;
    NSDictionary *command = [self normalizedCommandFromParams:value errorCode:&errorCode errorMessage:&errorMessage];
    if (!command) {
      reject(errorCode, errorMessage, nil);
      return;
    }
    [commands addObject:command];
  }

  dispatch_async(_workQueue, ^{
    NSMutableArray<NSDictionary *> *results = [NSMutableArray arrayWithCapacity:commands.count];
    for (NSDictionary *command in commands) {
      NSString *commandErrorCode = nil;
      NSString *commandErrorMessage = nil;
      NSError *commandError = nil;
      NSDictionary *payload = [self executeNormalizedCommand:command
                                                   errorCode:&commandErrorCode
                                                errorMessage:&commandErrorMessage
                                                       error:&commandError];
      if (!payload) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(commandErrorCode, commandErrorMessage, commandError);
        });
        return;
      }
      [results addObject:payload];
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      resolve([self jsonStringFromObject:results]);
    });
  });
#else
  reject(@"unsupported_platform", @"Command execution is only supported on macOS.", nil);
#endif
}

#if TARGET_OS_OSX
- (NSString *)resolveCommandPath:(NSString *)command
{
  NSString *expandedCommand = [command stringByExpandingTildeInPath];
  if ([expandedCommand containsString:@"/"]) {
    return [[NSFileManager defaultManager] isExecutableFileAtPath:expandedCommand] ? expandedCommand : nil;
  }

  NSString *homeDirectory = NSHomeDirectory();
  NSArray<NSString *> *fallbackPaths = @[
    [homeDirectory stringByAppendingPathComponent:@".local/bin"],
    [homeDirectory stringByAppendingPathComponent:@".bun/bin"],
    [homeDirectory stringByAppendingPathComponent:@"bin"],
    @"/opt/homebrew/bin",
    @"/usr/local/bin",
    @"/usr/bin",
    @"/bin",
    @"/usr/sbin",
    @"/sbin",
  ];
  NSMutableArray<NSString *> *searchPaths = [NSMutableArray array];
  NSString *pathValue = [[NSProcessInfo processInfo] environment][@"PATH"];
  if (pathValue.length > 0) {
    [searchPaths addObjectsFromArray:[pathValue componentsSeparatedByString:@":"]];
  }
  for (NSString *fallback in fallbackPaths) {
    if (![searchPaths containsObject:fallback]) {
      [searchPaths addObject:fallback];
    }
  }

  NSFileManager *fileManager = [NSFileManager defaultManager];
  for (NSString *directory in searchPaths) {
    NSString *candidate = [directory stringByAppendingPathComponent:command];
    if ([fileManager isExecutableFileAtPath:candidate]) {
      return candidate;
    }
  }

  return nil;
}
#endif

@end
