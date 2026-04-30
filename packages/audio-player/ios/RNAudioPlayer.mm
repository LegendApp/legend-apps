#import "RNAudioPlayer.h"

#import <AVFoundation/AVFoundation.h>
#import <MediaPlayer/MediaPlayer.h>
#import <React/RCTBridgeModule.h>

static NSString *RNAudioPlayerJSONString(id object)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:(object ?: [NSNull null]) options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"{}";
}

static NSDictionary *RNAudioPlayerJSONObjectFromString(NSString *json)
{
  if (![json isKindOfClass:NSString.class] || json.length == 0) {
    return @{};
  }

  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  id value = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  return [value isKindOfClass:NSDictionary.class] ? value : @{};
}

static NSURL *RNAudioPlayerURLFromPath(NSString *filePath)
{
  if ([filePath hasPrefix:@"file://"]) {
    return [NSURL URLWithString:filePath];
  }
  return [NSURL fileURLWithPath:filePath ?: @""];
}

@interface RNAudioPlayer ()
@property (nonatomic, strong, nullable) AVPlayer *player;
@property (nonatomic, strong, nullable) id progressObserver;
@property (nonatomic, strong, nullable) id completionObserver;
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, assign) BOOL isPlaying;
@property (nonatomic, assign) double duration;
@property (nonatomic, assign) float volume;
@end

@implementation RNAudioPlayer

RCT_EXPORT_MODULE(NativeAudioPlayer)

- (instancetype)init
{
  if (self = [super init]) {
    _duration = 0;
    _volume = 1;
    [self configureRemoteCommands];
  }
  return self;
}

- (void)dealloc
{
  [self removeProgressObserver];
  [self removeCompletionObserver];
  if (@available(iOS 7.1, macOS 10.12.2, *)) {
    MPRemoteCommandCenter *commandCenter = [MPRemoteCommandCenter sharedCommandCenter];
    [commandCenter.playCommand removeTarget:self];
    [commandCenter.pauseCommand removeTarget:self];
    [commandCenter.togglePlayPauseCommand removeTarget:self];
    [commandCenter.nextTrackCommand removeTarget:self];
    [commandCenter.previousTrackCommand removeTarget:self];
  }
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"onCompletion",
    @"onLoadError",
    @"onLoadSuccess",
    @"onOcclusionChanged",
    @"onPlaybackStateChanged",
    @"onProgress",
    @"onRemoteCommand"
  ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAudioPlayerSpecJSI>(params);
}

- (void)sendAudioEvent:(NSString *)name body:(NSDictionary *)body
{
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

- (void)configureRemoteCommands
{
  if (@available(iOS 7.1, macOS 10.12.2, *)) {
    MPRemoteCommandCenter *commandCenter = [MPRemoteCommandCenter sharedCommandCenter];
    [commandCenter.playCommand addTarget:self action:@selector(handlePlayCommand:)];
    [commandCenter.pauseCommand addTarget:self action:@selector(handlePauseCommand:)];
    [commandCenter.togglePlayPauseCommand addTarget:self action:@selector(handleToggleCommand:)];
    [commandCenter.nextTrackCommand addTarget:self action:@selector(handleNextCommand:)];
    [commandCenter.previousTrackCommand addTarget:self action:@selector(handlePreviousCommand:)];
  }
}

- (MPRemoteCommandHandlerStatus)emitRemoteCommand:(NSString *)command API_AVAILABLE(ios(7.1), macos(10.12.2))
{
  [self sendAudioEvent:@"onRemoteCommand" body:@{@"command": command}];
  return MPRemoteCommandHandlerStatusSuccess;
}

- (MPRemoteCommandHandlerStatus)handlePlayCommand:(MPRemoteCommandEvent *)event API_AVAILABLE(ios(7.1), macos(10.12.2))
{
  return [self emitRemoteCommand:@"play"];
}

- (MPRemoteCommandHandlerStatus)handlePauseCommand:(MPRemoteCommandEvent *)event API_AVAILABLE(ios(7.1), macos(10.12.2))
{
  return [self emitRemoteCommand:@"pause"];
}

- (MPRemoteCommandHandlerStatus)handleToggleCommand:(MPRemoteCommandEvent *)event API_AVAILABLE(ios(7.1), macos(10.12.2))
{
  return [self emitRemoteCommand:@"toggle"];
}

- (MPRemoteCommandHandlerStatus)handleNextCommand:(MPRemoteCommandEvent *)event API_AVAILABLE(ios(7.1), macos(10.12.2))
{
  return [self emitRemoteCommand:@"next"];
}

- (MPRemoteCommandHandlerStatus)handlePreviousCommand:(MPRemoteCommandEvent *)event API_AVAILABLE(ios(7.1), macos(10.12.2))
{
  return [self emitRemoteCommand:@"previous"];
}

- (void)removeProgressObserver
{
  if (_progressObserver && _player) {
    [_player removeTimeObserver:_progressObserver];
  }
  _progressObserver = nil;
}

- (void)removeCompletionObserver
{
  if (_completionObserver) {
    [[NSNotificationCenter defaultCenter] removeObserver:_completionObserver];
  }
  _completionObserver = nil;
}

- (void)addProgressObserver
{
  [self removeProgressObserver];
  if (!_player) {
    return;
  }

  __weak typeof(self) weakSelf = self;
  CMTime interval = CMTimeMakeWithSeconds(1, NSEC_PER_SEC);
  _progressObserver = [_player addPeriodicTimeObserverForInterval:interval queue:dispatch_get_main_queue() usingBlock:^(__unused CMTime time) {
    __strong typeof(weakSelf) self = weakSelf;
    if (!self || !self.player) {
      return;
    }

    double currentTime = CMTimeGetSeconds(self.player.currentTime);
    if (!isfinite(currentTime)) {
      currentTime = 0;
    }

    [self sendAudioEvent:@"onProgress"
                    body:@{
                      @"currentTime": @(currentTime),
                      @"duration": @(self.duration),
                    }];
  }];
}

- (void)addCompletionObserverForItem:(AVPlayerItem *)item
{
  [self removeCompletionObserver];
  __weak typeof(self) weakSelf = self;
  _completionObserver = [[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemDidPlayToEndTimeNotification
                                                                          object:item
                                                                           queue:[NSOperationQueue mainQueue]
                                                                      usingBlock:^(__unused NSNotification *notification) {
    __strong typeof(weakSelf) self = weakSelf;
    if (!self) {
      return;
    }

    self.isPlaying = NO;
    [self sendAudioEvent:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
    [self sendAudioEvent:@"onCompletion" body:@{}];
  }];
}

- (NSString *)successResult
{
  return RNAudioPlayerJSONString(@{@"success": @YES});
}

- (NSString *)errorResult:(NSString *)message
{
  return RNAudioPlayerJSONString(@{@"success": @NO, @"error": message ?: @"Unknown error"});
}

- (void)loadTrack:(NSString *)filePath
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(__unused RCTPromiseRejectBlock)reject
{
  NSURL *url = RNAudioPlayerURLFromPath(filePath);
  if (!url) {
    resolve([self errorResult:@"Invalid audio file path"]);
    return;
  }

  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];
  __weak typeof(self) weakSelf = self;
  [asset loadValuesAsynchronouslyForKeys:@[@"duration"] completionHandler:^{
    __strong typeof(weakSelf) self = weakSelf;
    if (!self) {
      return;
    }

    NSError *error = nil;
    AVKeyValueStatus status = [asset statusOfValueForKey:@"duration" error:&error];
    dispatch_async(dispatch_get_main_queue(), ^{
      if (status == AVKeyValueStatusFailed || status == AVKeyValueStatusCancelled) {
        NSString *message = error.localizedDescription ?: @"Failed to load audio track";
        [self sendAudioEvent:@"onLoadError" body:@{@"error": message}];
        resolve([self errorResult:message]);
        return;
      }

      [self removeProgressObserver];
      [self removeCompletionObserver];

      AVPlayerItem *item = [AVPlayerItem playerItemWithAsset:asset];
      self.player = [AVPlayer playerWithPlayerItem:item];
      self.player.volume = self.volume;
      self.isPlaying = NO;

      double duration = CMTimeGetSeconds(asset.duration);
      self.duration = isfinite(duration) ? duration : 0;

      [self addCompletionObserverForItem:item];
      [self addProgressObserver];
      [self sendAudioEvent:@"onLoadSuccess" body:@{@"duration": @(self.duration)}];
      [self sendAudioEvent:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
      resolve([self successResult]);
    });
  }];
}

- (void)play:(RCTPromiseResolveBlock)resolve
      reject:(__unused RCTPromiseRejectBlock)reject
{
  if (!_player) {
    resolve([self errorResult:@"No track loaded"]);
    return;
  }

  [_player play];
  _isPlaying = YES;
  [self sendAudioEvent:@"onPlaybackStateChanged" body:@{@"isPlaying": @YES}];
  resolve([self successResult]);
}

- (void)pause:(RCTPromiseResolveBlock)resolve
       reject:(__unused RCTPromiseRejectBlock)reject
{
  [_player pause];
  _isPlaying = NO;
  [self sendAudioEvent:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
  resolve([self successResult]);
}

- (void)stop:(RCTPromiseResolveBlock)resolve
      reject:(__unused RCTPromiseRejectBlock)reject
{
  [_player pause];
  [_player seekToTime:kCMTimeZero toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero];
  _isPlaying = NO;
  [self sendAudioEvent:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
  [self sendAudioEvent:@"onProgress" body:@{@"currentTime": @0, @"duration": @(_duration)}];
  resolve([self successResult]);
}

- (void)seek:(double)seconds
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(__unused RCTPromiseRejectBlock)reject
{
  if (!_player) {
    resolve([self errorResult:@"No track loaded"]);
    return;
  }

  double target = MAX(0, seconds);
  CMTime time = CMTimeMakeWithSeconds(target, NSEC_PER_SEC);
  [_player seekToTime:time toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:^(BOOL finished) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self sendAudioEvent:@"onProgress" body:@{@"currentTime": @(target), @"duration": @(self.duration)}];
      resolve(finished ? [self successResult] : [self errorResult:@"Seek was interrupted"]);
    });
  }];
}

- (void)setVolume:(double)volume
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(__unused RCTPromiseRejectBlock)reject
{
  _volume = (float)MIN(MAX(volume, 0), 1);
  _player.volume = _volume;
  resolve([self successResult]);
}

- (void)getCurrentState:(RCTPromiseResolveBlock)resolve
                reject:(__unused RCTPromiseRejectBlock)reject
{
  double currentTime = _player ? CMTimeGetSeconds(_player.currentTime) : 0;
  if (!isfinite(currentTime)) {
    currentTime = 0;
  }

  resolve(RNAudioPlayerJSONString(@{
    @"currentTime": @(currentTime),
    @"duration": @(_duration),
    @"isPlaying": @(_isPlaying),
    @"volume": @(_volume),
  }));
}

- (void)updateNowPlayingInfo:(NSString *)payloadJson
{
  if (@available(iOS 7.1, macOS 10.12.2, *)) {
    NSDictionary *payload = RNAudioPlayerJSONObjectFromString(payloadJson);
    NSMutableDictionary *info = [NSMutableDictionary new];

    if ([payload[@"title"] isKindOfClass:NSString.class]) {
      info[MPMediaItemPropertyTitle] = payload[@"title"];
    }
    if ([payload[@"artist"] isKindOfClass:NSString.class]) {
      info[MPMediaItemPropertyArtist] = payload[@"artist"];
    }
    if ([payload[@"album"] isKindOfClass:NSString.class]) {
      info[MPMediaItemPropertyAlbumTitle] = payload[@"album"];
    }
    if ([payload[@"duration"] isKindOfClass:NSNumber.class]) {
      info[MPMediaItemPropertyPlaybackDuration] = payload[@"duration"];
    }
    if ([payload[@"elapsedTime"] isKindOfClass:NSNumber.class]) {
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = payload[@"elapsedTime"];
    }
    if ([payload[@"playbackRate"] isKindOfClass:NSNumber.class]) {
      info[MPNowPlayingInfoPropertyPlaybackRate] = payload[@"playbackRate"];
    } else if ([payload[@"isPlaying"] isKindOfClass:NSNumber.class]) {
      info[MPNowPlayingInfoPropertyPlaybackRate] = [payload[@"isPlaying"] boolValue] ? @1 : @0;
    }

    [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = info;
  }
}

- (void)clearNowPlayingInfo
{
  if (@available(iOS 7.1, macOS 10.12.2, *)) {
    [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil;
  }
}

@end
