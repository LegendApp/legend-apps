#import <AVFoundation/AVFoundation.h>
#import <MediaPlayer/MediaPlayer.h>
#import <React/RCTEventEmitter.h>
#import <RNAudioPlayerSpec/RNAudioPlayerSpec.h>

NS_ASSUME_NONNULL_BEGIN

@interface RNAudioPlayer : RCTEventEmitter <NativeAudioPlayerSpec>

@property (nonatomic, strong) AVPlayer *player;
@property (nonatomic, strong, nullable) AVPlayerItem *playerItem;
@property (nonatomic, strong, nullable) id timeObserver;
@property (nonatomic, assign) BOOL isPlaying;
@property (nonatomic, assign) NSTimeInterval duration;
@property (nonatomic, assign) NSTimeInterval currentTime;
@property (atomic, assign) BOOL hasListeners;
@property (nonatomic, copy, nullable) RCTPromiseResolveBlock loadResolve;
@property (nonatomic, copy, nullable) RCTPromiseRejectBlock loadReject;
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *nowPlayingInfo;
@property (nonatomic, strong, nullable) NSArray<MPRemoteCommand *> *remoteCommandTargets;

@end

NS_ASSUME_NONNULL_END
