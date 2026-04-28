#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

NSArray<NSString *> *RNMediaTagsDefaultAudioExtensions(void);
NSArray<NSString *> *RNMediaTagsPlaylistExtensions(void);
BOOL RNMediaTagsIsAudioExtension(NSString *_Nullable extension, NSSet<NSString *> *_Nullable allowedExtensions);
BOOL RNMediaTagsIsPlaylistExtension(NSString *_Nullable extension);
NSDictionary *RNMediaTagsRead(NSURL *fileURL,
                              NSString *_Nullable cacheDirPath,
                              BOOL includeArtwork,
                              NSSet<NSString *> *_Nullable allowedExtensions);

NS_ASSUME_NONNULL_END
