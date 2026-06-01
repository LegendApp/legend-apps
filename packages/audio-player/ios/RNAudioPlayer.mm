#import "RNAudioPlayer.h"

#import <React/RCTBridgeModule.h>
#import <React/RCTLog.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

static const NSTimeInterval RNAudioPlayerProgressIntervalVisibleSeconds = 1.0;
static const NSTimeInterval RNAudioPlayerProgressIntervalOccludedSeconds = 20.0;

static NSString *RNAudioPlayerJSONString(id object)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:(object ?: [NSNull null]) options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
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

@interface RNAudioPlayer ()
@property (atomic, assign) BOOL progressEventsEnabled;
@property (atomic, assign) NSTimeInterval lastProgressDurationSent;
@property (atomic, assign) BOOL isWindowOccluded;
#if TARGET_OS_OSX
@property (nonatomic, weak, nullable) NSWindow *observedWindow;
#endif
@end

@implementation RNAudioPlayer

RCT_EXPORT_MODULE(NativeAudioPlayer)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
    _player = [AVPlayer new];
    _isPlaying = NO;
    _duration = 0;
    _currentTime = 0;
    _nowPlayingInfo = [NSMutableDictionary dictionary];
    _progressEventsEnabled = YES;
    _lastProgressDurationSent = -1;
    [self setupPlayerObservers];
    [self setupRemoteCommands];
    [self setupOcclusionObservers];
  }
  return self;
}

- (void)dealloc
{
  [self removeTimeObserver];
  [self removeCurrentItemObservers];
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self teardownRemoteCommands];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"onLoadSuccess",
    @"onLoadError",
    @"onPlaybackStateChanged",
    @"onProgress",
    @"onOcclusionChanged",
    @"onCompletion",
    @"onRemoteCommand",
  ];
}

- (void)startObserving
{
  self.hasListeners = YES;
  [self emitOcclusionEventWithState:self.isWindowOccluded];
  if (self.isPlaying && self.player && !self.timeObserver) {
    [self addTimeObserver];
  }
}

- (void)stopObserving
{
  self.hasListeners = NO;
  [self removeTimeObserver];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAudioPlayerSpecJSI>(params);
}

- (void)setupPlayerObservers
{
  [NSNotificationCenter.defaultCenter addObserver:self
                                         selector:@selector(playerItemDidReachEnd:)
                                             name:AVPlayerItemDidPlayToEndTimeNotification
                                           object:nil];
  [NSNotificationCenter.defaultCenter addObserver:self
                                         selector:@selector(playerItemFailedToPlay:)
                                             name:AVPlayerItemFailedToPlayToEndTimeNotification
                                           object:nil];
}

- (void)setupOcclusionObservers
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(handleWindowOcclusionChange:) name:NSWindowDidChangeOcclusionStateNotification object:nil];
    [center addObserver:self selector:@selector(handleWindowDidBecomeKey:) name:NSWindowDidBecomeKeyNotification object:nil];
    [center addObserver:self selector:@selector(handleWindowDidBecomeMain:) name:NSWindowDidBecomeMainNotification object:nil];
    [self updateObservedWindow:NSApp.mainWindow ?: NSApp.keyWindow];
  });
#endif
}

- (NSTimeInterval)progressUpdateInterval
{
  return self.isWindowOccluded ? RNAudioPlayerProgressIntervalOccludedSeconds : RNAudioPlayerProgressIntervalVisibleSeconds;
}

- (void)emitEventWithName:(NSString *)name body:(id)body
{
  if (self.hasListeners) {
    id eventBody = body ?: @{};
    void (^sendEvent)(void) = ^{
      if (self.hasListeners) {
        [self sendEventWithName:name body:eventBody];
      }
    };
    if ([NSThread isMainThread]) {
      sendEvent();
    } else {
      dispatch_async(dispatch_get_main_queue(), sendEvent);
    }
  }
}

- (void)emitOcclusionEventWithState:(BOOL)isOccluded
{
  [self emitEventWithName:@"onOcclusionChanged" body:@{@"isOccluded": @(isOccluded)}];
}

#if TARGET_OS_OSX
- (void)updateObservedWindow:(NSWindow *)window
{
  if (!window || window == self.observedWindow) {
    return;
  }
  self.observedWindow = window;
  [self applyOcclusionStateForWindow:window];
}

- (void)applyOcclusionStateForWindow:(NSWindow *)window
{
  if (!window) {
    return;
  }
  BOOL visible = (window.occlusionState & NSWindowOcclusionStateVisible) == NSWindowOcclusionStateVisible;
  BOOL nextOccluded = !visible;
  BOOL changed = nextOccluded != self.isWindowOccluded;
  self.isWindowOccluded = nextOccluded;
  if (changed) {
    [self emitOcclusionEventWithState:nextOccluded];
    [self addTimeObserver];
    [self emitProgressEventWithTime:self.currentTime forceDuration:YES allowWhilePaused:YES];
  }
}

- (void)handleWindowOcclusionChange:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  if (![window isKindOfClass:NSWindow.class]) {
    return;
  }
  if (!self.observedWindow) {
    self.observedWindow = window;
  }
  if (window == self.observedWindow) {
    [self applyOcclusionStateForWindow:window];
  }
}

- (void)handleWindowDidBecomeKey:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  if ([window isKindOfClass:NSWindow.class]) {
    [self updateObservedWindow:window];
  }
}

- (void)handleWindowDidBecomeMain:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  if ([window isKindOfClass:NSWindow.class]) {
    [self updateObservedWindow:window];
  }
}
#endif

- (void)setupRemoteCommands
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    [self teardownRemoteCommands];
    MPRemoteCommandCenter *commandCenter = MPRemoteCommandCenter.sharedCommandCenter;
    NSMutableArray<MPRemoteCommand *> *commands = [NSMutableArray array];

    NSArray<NSArray *> *pairs = @[
      @[commandCenter.playCommand, NSStringFromSelector(@selector(handlePlayCommand:))],
      @[commandCenter.pauseCommand, NSStringFromSelector(@selector(handlePauseCommand:))],
      @[commandCenter.togglePlayPauseCommand, NSStringFromSelector(@selector(handleTogglePlayPauseCommand:))],
      @[commandCenter.nextTrackCommand, NSStringFromSelector(@selector(handleNextTrackCommand:))],
      @[commandCenter.previousTrackCommand, NSStringFromSelector(@selector(handlePreviousTrackCommand:))],
    ];

    for (NSArray *pair in pairs) {
      MPRemoteCommand *command = pair[0];
      command.enabled = YES;
      [command addTarget:self action:NSSelectorFromString(pair[1])];
      [commands addObject:command];
    }
    self.remoteCommandTargets = commands;
  }
}

- (void)teardownRemoteCommands
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    for (MPRemoteCommand *command in self.remoteCommandTargets) {
      [command removeTarget:self];
      command.enabled = NO;
    }
    self.remoteCommandTargets = nil;
  }
}

- (MPRemoteCommandHandlerStatus)sendRemoteCommand:(NSString *)command
{
  [self emitEventWithName:@"onRemoteCommand" body:@{@"command": command}];
  return MPRemoteCommandHandlerStatusSuccess;
}

- (MPRemoteCommandHandlerStatus)handlePlayCommand:(MPRemoteCommandEvent *)event
{
  return [self sendRemoteCommand:@"play"];
}

- (MPRemoteCommandHandlerStatus)handlePauseCommand:(MPRemoteCommandEvent *)event
{
  return [self sendRemoteCommand:@"pause"];
}

- (MPRemoteCommandHandlerStatus)handleTogglePlayPauseCommand:(MPRemoteCommandEvent *)event
{
  return [self sendRemoteCommand:@"toggle"];
}

- (MPRemoteCommandHandlerStatus)handleNextTrackCommand:(MPRemoteCommandEvent *)event
{
  return [self sendRemoteCommand:@"next"];
}

- (MPRemoteCommandHandlerStatus)handlePreviousTrackCommand:(MPRemoteCommandEvent *)event
{
  return [self sendRemoteCommand:@"previous"];
}

- (void)updateNowPlayingElapsedTime:(NSTimeInterval)elapsedTime
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(elapsedTime);
    MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo = [self.nowPlayingInfo copy];
  }
}

- (void)updateNowPlayingDuration:(NSTimeInterval)duration
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    self.nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = @(duration);
    MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo = [self.nowPlayingInfo copy];
  }
}

- (void)updateNowPlayingPlaybackState:(BOOL)isPlaying
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    MPNowPlayingInfoCenter *center = MPNowPlayingInfoCenter.defaultCenter;
    if ([center respondsToSelector:@selector(setPlaybackState:)]) {
      center.playbackState = isPlaying ? MPNowPlayingPlaybackStatePlaying : MPNowPlayingPlaybackStatePaused;
    }
    self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = @(isPlaying ? 1.0 : 0.0);
    center.nowPlayingInfo = [self.nowPlayingInfo copy];
  }
}

- (void)playerItemDidReachEnd:(NSNotification *)notification
{
  AVPlayerItem *item = [notification.object isKindOfClass:AVPlayerItem.class] ? notification.object : nil;
  if (item) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (item == self.playerItem) {
        self.isPlaying = NO;
        [self removeTimeObserver];
        self.currentTime = self.duration;
        [self updateNowPlayingElapsedTime:self.currentTime];
        [self updateNowPlayingPlaybackState:NO];
        [self emitEventWithName:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
        [self emitEventWithName:@"onCompletion" body:@{}];
      }
    });
  }
}

- (void)playerItemFailedToPlay:(NSNotification *)notification
{
  AVPlayerItem *item = [notification.object isKindOfClass:AVPlayerItem.class] ? notification.object : nil;
  if (item) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (item == self.playerItem) {
        self.isPlaying = NO;
        [self removeTimeObserver];
        [self updateNowPlayingPlaybackState:NO];
        [self emitEventWithName:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
        [self emitEventWithName:@"onLoadError" body:@{@"error": @"Playback failed"}];
      }
    });
  }
}

- (void)loadTrack:(NSString *)filePath
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.player.rate > 0) {
      [self.player pause];
      self.isPlaying = NO;
    }
    [self removeCurrentItemObservers];

    NSURL *fileURL = [filePath hasPrefix:@"file://"] ? [NSURL URLWithString:filePath] : [NSURL fileURLWithPath:filePath ?: @""];
    if (!fileURL || ![NSFileManager.defaultManager fileExistsAtPath:fileURL.path]) {
      resolve(RNAudioPlayerJSONString(@{@"success": @NO, @"error": @"Audio file not found"}));
      return;
    }

    self.playerItem = [AVPlayerItem playerItemWithURL:fileURL];
    self.player.automaticallyWaitsToMinimizeStalling = YES;
    self.playerItem.preferredForwardBufferDuration = 4.0;
    self.playerItem.canUseNetworkResourcesForLiveStreamingWhilePaused = NO;
    [self.player replaceCurrentItemWithPlayerItem:self.playerItem];
    [self.playerItem addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:nil];
    [self.playerItem addObserver:self forKeyPath:@"duration" options:NSKeyValueObservingOptionNew context:nil];
    self.loadResolve = resolve;
    self.loadReject = reject;
  });
}

- (void)removeCurrentItemObservers
{
  if (!self.playerItem) {
    return;
  }
  @try {
    [self.playerItem removeObserver:self forKeyPath:@"status"];
  } @catch (__unused NSException *exception) {
  }
  @try {
    [self.playerItem removeObserver:self forKeyPath:@"duration"];
  } @catch (__unused NSException *exception) {
  }
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary<NSKeyValueChangeKey,id> *)change context:(void *)context
{
  AVPlayerItem *item = (AVPlayerItem *)object;
  if ([keyPath isEqualToString:@"status"]) {
    if (item.status == AVPlayerItemStatusReadyToPlay) {
      CMTime duration = item.duration;
      if (CMTIME_IS_NUMERIC(duration)) {
        double seconds = CMTimeGetSeconds(duration);
        if (isfinite(seconds)) {
          self.duration = seconds;
        }
      }
      self.currentTime = 0;
      [self updateNowPlayingDuration:self.duration];
      [self updateNowPlayingElapsedTime:self.currentTime];
      [self removeCurrentItemObservers];
      [self emitEventWithName:@"onLoadSuccess" body:@{@"duration": @(self.duration)}];
      self.lastProgressDurationSent = -1;
      [self emitProgressEventWithTime:self.currentTime forceDuration:YES allowWhilePaused:YES];
      if (self.loadResolve) {
        self.loadResolve(RNAudioPlayerJSONString(@{@"success": @YES}));
        self.loadResolve = nil;
        self.loadReject = nil;
      }
    } else if (item.status == AVPlayerItemStatusFailed) {
      NSError *error = item.error;
      [self removeCurrentItemObservers];
      NSString *message = error.localizedDescription ?: @"Unknown error";
      [self emitEventWithName:@"onLoadError" body:@{@"error": message}];
      if (self.loadResolve) {
        self.loadResolve(RNAudioPlayerJSONString(@{@"success": @NO, @"error": message}));
        self.loadResolve = nil;
        self.loadReject = nil;
      }
    }
  } else if ([keyPath isEqualToString:@"duration"]) {
    CMTime duration = item.duration;
    if (CMTIME_IS_NUMERIC(duration)) {
      double seconds = CMTimeGetSeconds(duration);
      if (isfinite(seconds)) {
        self.duration = seconds;
        [self updateNowPlayingDuration:self.duration];
      }
    }
  }
}

- (void)play:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.playerItem) {
      resolve(RNAudioPlayerJSONString(@{@"success": @NO, @"error": @"No audio file loaded"}));
      return;
    }
    if (self.player.rate > 0) {
      resolve(RNAudioPlayerJSONString(@{@"success": @YES}));
      return;
    }
    [self setupRemoteCommands];
    [self.player play];
    self.isPlaying = YES;
    if (self.hasListeners) {
      [self addTimeObserver];
    }
    [self updateNowPlayingPlaybackState:YES];
    [self emitEventWithName:@"onPlaybackStateChanged" body:@{@"isPlaying": @YES}];
    resolve(RNAudioPlayerJSONString(@{@"success": @YES}));
  });
}

- (void)pause:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.player pause];
    self.isPlaying = NO;
    [self removeTimeObserver];
    [self updateNowPlayingPlaybackState:NO];
    [self emitEventWithName:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
    resolve(RNAudioPlayerJSONString(@{@"success": @YES}));
  });
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.player pause];
    [self.player seekToTime:kCMTimeZero];
    self.isPlaying = NO;
    self.currentTime = 0;
    [self removeTimeObserver];
    [self updateNowPlayingElapsedTime:self.currentTime];
    [self updateNowPlayingPlaybackState:NO];
    [self emitEventWithName:@"onPlaybackStateChanged" body:@{@"isPlaying": @NO}];
    resolve(RNAudioPlayerJSONString(@{@"success": @YES}));
  });
}

- (void)seek:(double)seconds resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.player || !self.playerItem || !isfinite(seconds)) {
      resolve(RNAudioPlayerJSONString(@{@"success": @NO, @"error": @"Invalid seek"}));
      return;
    }
    double targetSeconds = MAX(0, seconds);
    if (isfinite(self.duration) && self.duration > 0) {
      targetSeconds = MIN(targetSeconds, self.duration);
    }
    CMTime seekTime = CMTimeMakeWithSeconds(targetSeconds, NSEC_PER_SEC);
    [self.player seekToTime:seekTime toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:^(BOOL finished) {
      self.currentTime = targetSeconds;
      [self updateNowPlayingElapsedTime:self.currentTime];
      resolve(RNAudioPlayerJSONString(@{@"success": @(finished)}));
    }];
  });
}

- (void)setVolume:(double)volume resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    self.player.volume = MAX(0.0f, MIN(1.0f, (float)volume));
    resolve(RNAudioPlayerJSONString(@{@"success": @YES}));
  });
}

- (void)getCurrentState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CMTime currentTime = self.player.currentTime;
    if (CMTIME_IS_VALID(currentTime)) {
      self.currentTime = CMTimeGetSeconds(currentTime);
    }
    resolve(RNAudioPlayerJSONString(@{
      @"isPlaying": @(self.isPlaying),
      @"currentTime": @(self.currentTime),
      @"duration": @(self.duration),
      @"volume": @(self.player ? self.player.volume : 1.0f),
    }));
  });
}

- (void)updateNowPlayingInfo:(NSString *)infoJson
{
  NSDictionary *info = RNAudioPlayerJSONObjectFromString(infoJson);
  if (info.count == 0) {
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    [self applyNowPlayingInfo:info];
  });
}

- (void)applyNowPlayingInfo:(NSDictionary *)info
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    NSDictionary *stringFields = @{
      @"title": MPMediaItemPropertyTitle,
      @"artist": MPMediaItemPropertyArtist,
      @"album": MPMediaItemPropertyAlbumTitle,
    };
    for (NSString *field in stringFields) {
      id value = info[field];
      NSString *key = stringFields[field];
      if ([value isKindOfClass:NSString.class]) {
        self.nowPlayingInfo[key] = value;
      } else if (value == (id)kCFNull) {
        [self.nowPlayingInfo removeObjectForKey:key];
      }
    }

    id durationValue = info[@"duration"];
    if ([durationValue isKindOfClass:NSNumber.class]) {
      self.duration = [durationValue doubleValue];
      self.nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = durationValue;
    } else if (durationValue == (id)kCFNull) {
      [self.nowPlayingInfo removeObjectForKey:MPMediaItemPropertyPlaybackDuration];
    }

    id elapsedValue = info[@"elapsedTime"];
    if ([elapsedValue isKindOfClass:NSNumber.class]) {
      self.currentTime = [elapsedValue doubleValue];
      self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsedValue;
    } else if (elapsedValue == (id)kCFNull) {
      [self.nowPlayingInfo removeObjectForKey:MPNowPlayingInfoPropertyElapsedPlaybackTime];
    }

    id playbackRateValue = info[@"playbackRate"];
    if ([playbackRateValue isKindOfClass:NSNumber.class]) {
      self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = playbackRateValue;
    } else if (playbackRateValue == (id)kCFNull) {
      [self.nowPlayingInfo removeObjectForKey:MPNowPlayingInfoPropertyPlaybackRate];
    }

    id artworkValue = info[@"artwork"];
    if ([artworkValue isKindOfClass:NSString.class] && [(NSString *)artworkValue length] > 0) {
      NSURL *artworkURL = [(NSString *)artworkValue hasPrefix:@"file://"]
        ? [NSURL URLWithString:artworkValue]
        : [NSURL fileURLWithPath:artworkValue];
#if TARGET_OS_OSX
      NSImage *image = [[NSImage alloc] initWithContentsOfURL:artworkURL];
      if (image) {
        self.nowPlayingInfo[MPMediaItemPropertyArtwork] = [[MPMediaItemArtwork alloc] initWithBoundsSize:image.size requestHandler:^NSImage * _Nonnull(CGSize size) {
          return image;
        }];
      }
#endif
    } else if (artworkValue == (id)kCFNull) {
      [self.nowPlayingInfo removeObjectForKey:MPMediaItemPropertyArtwork];
    }

    id isPlayingValue = info[@"isPlaying"];
    if ([isPlayingValue isKindOfClass:NSNumber.class]) {
      [self updateNowPlayingPlaybackState:[isPlayingValue boolValue]];
    } else {
      MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo = [self.nowPlayingInfo copy];
    }
  }
}

- (void)clearNowPlayingInfo
{
  if (@available(macOS 10.12.2, iOS 7.1, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self.nowPlayingInfo removeAllObjects];
      self.currentTime = 0;
      self.duration = 0;
      MPNowPlayingInfoCenter *center = MPNowPlayingInfoCenter.defaultCenter;
      center.nowPlayingInfo = nil;
      if ([center respondsToSelector:@selector(setPlaybackState:)]) {
        center.playbackState = MPNowPlayingPlaybackStateStopped;
      }
    });
  }
}

- (void)emitProgressEventWithTime:(NSTimeInterval)time forceDuration:(BOOL)forceDuration allowWhilePaused:(BOOL)allowWhilePaused
{
  if (!self.progressEventsEnabled || !self.hasListeners) {
    return;
  }
  if (!allowWhilePaused && !self.isPlaying) {
    return;
  }

  NSTimeInterval duration = self.duration;
  BOOL shouldIncludeDuration = forceDuration || fabs(duration - self.lastProgressDurationSent) >= 0.1;
  NSMutableDictionary *payload = [NSMutableDictionary dictionaryWithObject:@(time) forKey:@"currentTime"];
  if (shouldIncludeDuration) {
    payload[@"duration"] = @(duration);
    self.lastProgressDurationSent = duration;
  }
  [self emitEventWithName:@"onProgress" body:payload];
}

- (void)addTimeObserver
{
  [self removeTimeObserver];
  if (!self.progressEventsEnabled) {
    return;
  }
  self.lastProgressDurationSent = -1;
  __weak RNAudioPlayer *weakSelf = self;
  CMTime interval = CMTimeMakeWithSeconds([self progressUpdateInterval], NSEC_PER_SEC);
  self.timeObserver = [self.player addPeriodicTimeObserverForInterval:interval queue:dispatch_get_global_queue(QOS_CLASS_BACKGROUND, 0) usingBlock:^(CMTime time) {
    RNAudioPlayer *strongSelf = weakSelf;
    if (strongSelf && strongSelf.hasListeners && strongSelf.isPlaying && CMTIME_IS_VALID(time)) {
      NSTimeInterval newTime = CMTimeGetSeconds(time);
      if (fabs(newTime - strongSelf.currentTime) >= 0.1) {
        strongSelf.currentTime = newTime;
        [strongSelf updateNowPlayingElapsedTime:strongSelf.currentTime];
        [strongSelf emitProgressEventWithTime:strongSelf.currentTime forceDuration:NO allowWhilePaused:NO];
      }
    }
  }];
}

- (void)removeTimeObserver
{
  if (self.timeObserver) {
    [self.player removeTimeObserver:self.timeObserver];
    self.timeObserver = nil;
  }
}

@end
