#import "RNInstrumentation.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX && DEBUG
#import <os/log.h>
#endif

@implementation RNInstrumentation

RCT_EXPORT_MODULE(NativeInstrumentation)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeInstrumentationSpecJSI>(params);
}

- (void)log:(NSString *)category message:(NSString *)message
{
#if TARGET_OS_OSX && DEBUG
  static os_log_t timingLog = os_log_create("app.legend.instrumentation", "timing");
  static os_log_t memoryLog = os_log_create("app.legend.instrumentation", "memory");
  os_log_t log = [category isEqualToString:@"memory"] ? memoryLog : timingLog;
  os_log_with_type(log, OS_LOG_TYPE_DEFAULT, "%{public}s", message.UTF8String);
#endif
}

@end
