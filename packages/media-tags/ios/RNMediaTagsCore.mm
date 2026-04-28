#import "RNMediaTagsCore.h"
#import "RNMediaTags-Swift.h"

#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioFile.h>
#import <CommonCrypto/CommonCrypto.h>
#import <ImageIO/ImageIO.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

static NSString *RNMediaTagsNormalizePath(NSString *path)
{
  if (![path isKindOfClass:NSString.class] || path.length == 0) {
    return @"";
  }
  if ([path hasPrefix:@"file://"]) {
    NSURL *url = [NSURL URLWithString:path];
    if (url.path.length > 0) {
      path = url.path;
    }
  }
  return path.stringByExpandingTildeInPath.stringByStandardizingPath;
}

static NSString *RNMediaTagsHashStringSHA256(NSString *input)
{
  NSData *data = [(input ?: @"") dataUsingEncoding:NSUTF8StringEncoding];
  uint8_t digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *hash = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (int index = 0; index < CC_SHA256_DIGEST_LENGTH; index += 1) {
    [hash appendFormat:@"%02x", digest[index]];
  }
  return hash;
}

static NSData *RNMediaTagsCreateThumbnail(NSData *imageData, NSUInteger maxPixelSize)
{
  if (!imageData) {
    return nil;
  }

  NSDictionary *options = @{
    (id)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (id)kCGImageSourceThumbnailMaxPixelSize : @(maxPixelSize),
    (id)kCGImageSourceCreateThumbnailWithTransform : @YES,
  };

  CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)imageData, NULL);
  if (!source) {
    return nil;
  }

  CGImageRef thumbImage = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
  CFRelease(source);
  if (!thumbImage) {
    return nil;
  }

#if TARGET_OS_OSX
  NSBitmapImageRep *bitmapRep = [[NSBitmapImageRep alloc] initWithCGImage:thumbImage];
  CGImageRelease(thumbImage);
  return [bitmapRep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
#else
  CFMutableDataRef data = CFDataCreateMutable(NULL, 0);
  CGImageDestinationRef destination = CGImageDestinationCreateWithData(data, CFSTR("public.png"), 1, NULL);
  if (!destination) {
    CGImageRelease(thumbImage);
    CFRelease(data);
    return nil;
  }
  CGImageDestinationAddImage(destination, thumbImage, NULL);
  BOOL success = CGImageDestinationFinalize(destination);
  CFRelease(destination);
  CGImageRelease(thumbImage);
  NSData *result = success ? [(__bridge NSData *)data copy] : nil;
  CFRelease(data);
  return result;
#endif
}

static void RNMediaTagsCacheArtwork(NSData *artworkData,
                                    NSURL *fileURL,
                                    NSString *cacheDirPath,
                                    NSString *__autoreleasing *artworkUriOut,
                                    NSString *__autoreleasing *artworkKeyOut)
{
  NSString *normalizedCacheDir = RNMediaTagsNormalizePath(cacheDirPath);
  if (!artworkData || normalizedCacheDir.length == 0 || !fileURL.path.length) {
    return;
  }

  NSData *thumbnail = RNMediaTagsCreateThumbnail(artworkData, 256);
  if (!thumbnail) {
    return;
  }

  NSString *artworkKey = RNMediaTagsHashStringSHA256([NSString stringWithFormat:@"%@:artwork", fileURL.path]);
  NSString *filePath = [normalizedCacheDir stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.png", artworkKey]];
  [[NSFileManager defaultManager] createDirectoryAtPath:normalizedCacheDir withIntermediateDirectories:YES attributes:nil error:nil];
  if ([thumbnail writeToFile:filePath atomically:YES]) {
    if (artworkKeyOut) {
      *artworkKeyOut = artworkKey;
    }
    if (artworkUriOut) {
      *artworkUriOut = [NSURL fileURLWithPath:filePath].absoluteString;
    }
  }
}

static NSNumber *RNMediaTagsParseTrackNumberString(NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return nil;
  }
  NSRange range = [value rangeOfCharacterFromSet:NSCharacterSet.decimalDigitCharacterSet];
  if (range.location == NSNotFound) {
    return nil;
  }
  NSUInteger length = 0;
  while (range.location + length < value.length) {
    unichar character = [value characterAtIndex:range.location + length];
    if (![NSCharacterSet.decimalDigitCharacterSet characterIsMember:character]) {
      break;
    }
    length += 1;
  }
  NSInteger number = [[value substringWithRange:NSMakeRange(range.location, length)] integerValue];
  return number > 0 ? @(number) : nil;
}

static NSNumber *RNMediaTagsParseTrackNumber(id value)
{
  if ([value isKindOfClass:NSNumber.class]) {
    NSInteger number = [value integerValue];
    return number > 0 ? @(number) : nil;
  }
  if ([value isKindOfClass:NSString.class]) {
    return RNMediaTagsParseTrackNumberString(value);
  }
  if ([value respondsToSelector:@selector(stringValue)]) {
    return RNMediaTagsParseTrackNumberString([value stringValue]);
  }
  return nil;
}

static NSNumber *RNMediaTagsReadDurationWithAudioFile(NSURL *fileURL)
{
  AudioFileID audioFile = NULL;
  OSStatus openStatus = AudioFileOpenURL((__bridge CFURLRef)fileURL, kAudioFileReadPermission, 0, &audioFile);
  if (openStatus == noErr && audioFile != NULL) {
    Float64 duration = 0;
    UInt32 dataSize = sizeof(duration);
    OSStatus durationStatus = AudioFileGetProperty(audioFile, kAudioFilePropertyEstimatedDuration, &dataSize, &duration);
    AudioFileClose(audioFile);
    if (durationStatus == noErr && isfinite(duration) && duration > 0) {
      return @(duration);
    }
  }
  return nil;
}

static NSDictionary *RNMediaTagsReadID3(NSURL *fileURL, NSString *cacheDirPath, BOOL includeArtwork)
{
  NSError *error = nil;
  RNMediaTagsID3Result *tags = [RNMediaTagsID3Bridge readTagsForURL:fileURL error:&error];
  if (!tags) {
    return @{};
  }

  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  if (tags.title.length > 0) {
    result[@"title"] = tags.title;
  }
  if (tags.artist.length > 0) {
    result[@"artist"] = tags.artist;
  }
  if (tags.album.length > 0) {
    result[@"album"] = tags.album;
  }
  if (tags.durationSeconds.doubleValue > 0) {
    result[@"durationSeconds"] = tags.durationSeconds;
  }

  if (includeArtwork && tags.artworkData.length > 0) {
    NSString *artworkUri = nil;
    NSString *artworkKey = nil;
    RNMediaTagsCacheArtwork((NSData *)tags.artworkData, fileURL, cacheDirPath, &artworkUri, &artworkKey);
    if (artworkUri.length > 0) {
      result[@"artworkUri"] = artworkUri;
    }
    if (artworkKey.length > 0) {
      result[@"artworkKey"] = artworkKey;
    }
  }

  return result;
}

static NSNumber *RNMediaTagsTrackNumber(AVURLAsset *asset)
{
  NSArray<AVMetadataItem *> *id3Items = [AVMetadataItem metadataItemsFromArray:[asset metadataForFormat:AVMetadataFormatID3Metadata]
                                                                       withKey:AVMetadataID3MetadataKeyTrackNumber
                                                                      keySpace:AVMetadataKeySpaceID3];
  if (id3Items.count > 0) {
    return RNMediaTagsParseTrackNumber(id3Items.firstObject.value ?: id3Items.firstObject.stringValue);
  }

  NSArray<AVMetadataItem *> *itunesItems = [AVMetadataItem metadataItemsFromArray:[asset metadataForFormat:AVMetadataFormatiTunesMetadata]
                                                                          withKey:AVMetadataiTunesMetadataKeyTrackNumber
                                                                         keySpace:AVMetadataKeySpaceiTunes];
  if (itunesItems.count > 0) {
    return RNMediaTagsParseTrackNumber(itunesItems.firstObject.value ?: itunesItems.firstObject.stringValue);
  }

  return nil;
}

NSArray<NSString *> *RNMediaTagsDefaultAudioExtensions(void)
{
  return @[@"mp3", @"wav", @"m4a", @"aac", @"flac", @"aif", @"aiff", @"aifc", @"caf"];
}

NSArray<NSString *> *RNMediaTagsPlaylistExtensions(void)
{
  return @[@"m3u", @"m3u8"];
}

BOOL RNMediaTagsIsAudioExtension(NSString *extension, NSSet<NSString *> *allowedExtensions)
{
  NSString *normalized = extension.lowercaseString ?: @"";
  NSSet<NSString *> *extensions = allowedExtensions.count > 0
    ? allowedExtensions
    : [NSSet setWithArray:RNMediaTagsDefaultAudioExtensions()];
  return normalized.length > 0 && [extensions containsObject:normalized];
}

BOOL RNMediaTagsIsPlaylistExtension(NSString *extension)
{
  return [[NSSet setWithArray:RNMediaTagsPlaylistExtensions()] containsObject:extension.lowercaseString ?: @""];
}

NSDictionary *RNMediaTagsRead(NSURL *fileURL,
                              NSString *cacheDirPath,
                              BOOL includeArtwork,
                              NSSet<NSString *> *allowedExtensions)
{
  if (!fileURL.path.length || !RNMediaTagsIsAudioExtension(fileURL.pathExtension, allowedExtensions)) {
    return @{};
  }

  if ([fileURL.pathExtension.lowercaseString isEqualToString:@"mp3"]) {
    NSDictionary *id3Tags = RNMediaTagsReadID3(fileURL, cacheDirPath, includeArtwork);
    if (id3Tags.count > 0) {
      return id3Tags;
    }
  }

  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:fileURL options:nil];
  NSArray<AVMetadataItem *> *commonMetadata = asset.commonMetadata;
  NSMutableDictionary *result = [NSMutableDictionary dictionary];

  AVMetadataItem *titleItem = [AVMetadataItem metadataItemsFromArray:commonMetadata
                                                             withKey:AVMetadataCommonKeyTitle
                                                            keySpace:AVMetadataKeySpaceCommon].firstObject;
  AVMetadataItem *artistItem = [AVMetadataItem metadataItemsFromArray:commonMetadata
                                                              withKey:AVMetadataCommonKeyArtist
                                                             keySpace:AVMetadataKeySpaceCommon].firstObject;
  AVMetadataItem *albumItem = [AVMetadataItem metadataItemsFromArray:commonMetadata
                                                             withKey:AVMetadataCommonKeyAlbumName
                                                            keySpace:AVMetadataKeySpaceCommon].firstObject;
  if (titleItem.stringValue.length > 0) {
    result[@"title"] = titleItem.stringValue;
  }
  if (artistItem.stringValue.length > 0) {
    result[@"artist"] = artistItem.stringValue;
  }
  if (albumItem.stringValue.length > 0) {
    result[@"album"] = albumItem.stringValue;
  }

  NSNumber *trackNumber = RNMediaTagsTrackNumber(asset);
  if (trackNumber) {
    result[@"trackNumber"] = trackNumber;
  }

  NSNumber *durationSeconds = nil;
  CMTime duration = asset.duration;
  if (CMTIME_IS_NUMERIC(duration)) {
    Float64 seconds = CMTimeGetSeconds(duration);
    if (isfinite(seconds) && seconds > 0) {
      durationSeconds = @(seconds);
    }
  }
  if (!durationSeconds) {
    durationSeconds = RNMediaTagsReadDurationWithAudioFile(fileURL);
  }
  if (durationSeconds) {
    result[@"durationSeconds"] = durationSeconds;
  }

  if (includeArtwork) {
    NSData *artworkData = [AVMetadataItem metadataItemsFromArray:commonMetadata
                                                         withKey:AVMetadataCommonKeyArtwork
                                                        keySpace:AVMetadataKeySpaceCommon].firstObject.dataValue;
    if (!artworkData) {
      artworkData = [AVMetadataItem metadataItemsFromArray:[asset metadataForFormat:AVMetadataFormatiTunesMetadata]
                                                   withKey:AVMetadataiTunesMetadataKeyCoverArt
                                                  keySpace:AVMetadataKeySpaceiTunes].firstObject.dataValue;
    }
    if (!artworkData) {
      artworkData = [AVMetadataItem metadataItemsFromArray:[asset metadataForFormat:AVMetadataFormatID3Metadata]
                                                   withKey:AVMetadataID3MetadataKeyAttachedPicture
                                                  keySpace:AVMetadataKeySpaceID3].firstObject.dataValue;
    }

    NSString *artworkUri = nil;
    NSString *artworkKey = nil;
    RNMediaTagsCacheArtwork(artworkData, fileURL, cacheDirPath, &artworkUri, &artworkKey);
    if (artworkUri.length > 0) {
      result[@"artworkUri"] = artworkUri;
    }
    if (artworkKey.length > 0) {
      result[@"artworkKey"] = artworkKey;
    }
  }

  return result;
}
