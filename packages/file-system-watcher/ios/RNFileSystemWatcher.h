#import <React/RCTEventEmitter.h>
#import <RNFileSystemWatcherSpec/RNFileSystemWatcherSpec.h>

NS_ASSUME_NONNULL_BEGIN

@interface RNFileSystemWatcher : RCTEventEmitter <NativeFileSystemWatcherSpec>
@end

NS_ASSUME_NONNULL_END
