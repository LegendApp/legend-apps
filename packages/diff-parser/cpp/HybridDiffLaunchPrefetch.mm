#include "HybridDiffLaunchPrefetch.hpp"

#import <Foundation/Foundation.h>

#include <mutex>
#include <optional>
#include <utility>

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

struct LaunchPrefetchState {
  std::string diffUrl;
  std::string sourceLabel;
  std::shared_ptr<HybridDiffLoadSession> session;
  bool claimed = false;
};

std::mutex& launchPrefetchMutex() {
  static std::mutex mutex;
  return mutex;
}

LaunchPrefetchState& launchPrefetchState() {
  static LaunchPrefetchState state;
  return state;
}

} // namespace

std::shared_ptr<HybridDiffLoadSession> claimLaunchPrefetchedUnifiedDiffUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel) {
  std::lock_guard<std::mutex> lock(launchPrefetchMutex());
  auto& state = launchPrefetchState();
  std::shared_ptr<HybridDiffLoadSession> session;
  if (!state.claimed && state.session && state.diffUrl == diffUrl) {
    state.claimed = true;
    state.sourceLabel = sourceLabel;
    session = state.session;
  }
  return session;
}

void startLaunchPrefetchedUnifiedDiffUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel) {
  std::lock_guard<std::mutex> lock(launchPrefetchMutex());
  auto& state = launchPrefetchState();
  if (!state.session && !diffUrl.empty()) {
    state.diffUrl = diffUrl;
    state.sourceLabel = sourceLabel;
    state.session = HybridDiffLoadSession::createUnifiedDiffUrl(diffUrl, sourceLabel);
  }
}

} // namespace margelo::nitro::legenddesktop::diffparser

namespace {

struct NormalizedLaunchDiffUrl {
  std::string diffUrl;
  std::string sourceLabel;
};

NSString* getLaunchArgumentValue(NSArray<NSString*>* arguments, NSString* name) {
  NSString* prefix = [name stringByAppendingString:@"="];
  for (NSString* argument in arguments) {
    if ([argument hasPrefix:prefix]) {
      NSString* value = [argument substringFromIndex:prefix.length];
      return value.length > 0 ? value : nil;
    }
  }

  NSUInteger flagIndex = [arguments indexOfObject:name];
  if (flagIndex != NSNotFound && flagIndex + 1 < arguments.count) {
    NSString* value = arguments[flagIndex + 1];
    return [value hasPrefix:@"--"] ? nil : value;
  }
  return nil;
}

NSString* firstGithubLaunchArgument(NSArray<NSString*>* arguments) {
  for (NSString* argument in arguments) {
    if ([argument rangeOfString:@"github.com/" options:NSCaseInsensitiveSearch].location != NSNotFound ||
        [argument rangeOfString:@"diffshub.com/" options:NSCaseInsensitiveSearch].location != NSNotFound) {
      return argument;
    }
  }
  return nil;
}

NSURL* parseLaunchUrl(NSString* value) {
  NSURL* url = [NSURL URLWithString:value];
  if (!url.scheme && (
          [value rangeOfString:@"github.com/" options:NSCaseInsensitiveSearch].location == 0 ||
          [value rangeOfString:@"www.github.com/" options:NSCaseInsensitiveSearch].location == 0 ||
          [value rangeOfString:@"diffshub.com/" options:NSCaseInsensitiveSearch].location == 0 ||
          [value rangeOfString:@"www.diffshub.com/" options:NSCaseInsensitiveSearch].location == 0)) {
    url = [NSURL URLWithString:[@"https://" stringByAppendingString:value]];
  }
  return url;
}

std::string stdString(NSString* value) {
  const char* utf8 = value.UTF8String;
  return utf8 != nullptr ? std::string(utf8) : std::string();
}

std::optional<NormalizedLaunchDiffUrl> normalizeGithubLaunchDiffUrl(NSString* value) {
  NSURL* url = parseLaunchUrl(value);
  NSString* host = url.host.lowercaseString;
  NSSet<NSString*>* supportedHosts = [NSSet setWithArray:@[
    @"github.com",
    @"www.github.com",
    @"diffshub.com",
    @"www.diffshub.com",
  ]];
  if (!url || ![supportedHosts containsObject:host]) {
    return std::nullopt;
  }

  NSArray<NSString*>* parts = [url.path componentsSeparatedByString:@"/"];
  NSMutableArray<NSString*>* pathParts = [NSMutableArray array];
  for (NSString* part in parts) {
    if (part.length > 0) {
      [pathParts addObject:part];
    }
  }

  if (pathParts.count < 4) {
    return std::nullopt;
  }

  NSString* owner = pathParts[0];
  NSString* repo = pathParts[1];
  NSString* type = pathParts[2];
  NSString* identifier = pathParts[3];
  if (![type isEqualToString:@"pull"] && ![type isEqualToString:@"commit"]) {
    return std::nullopt;
  }

  NSString* extension = identifier.pathExtension.lowercaseString;
  if ([extension isEqualToString:@"diff"] || [extension isEqualToString:@"patch"]) {
    identifier = identifier.stringByDeletingPathExtension;
  }
  if (owner.length == 0 || repo.length == 0 || identifier.length == 0) {
    return std::nullopt;
  }

  NSString* canonicalUrl = [NSString stringWithFormat:@"https://github.com/%@/%@/%@/%@", owner, repo, type, identifier];
  const NSUInteger shortIdentifierLength = MIN((NSUInteger)7, identifier.length);
  NSString* label = [type isEqualToString:@"pull"]
    ? [NSString stringWithFormat:@"%@/%@#%@", owner, repo, identifier]
    : [NSString stringWithFormat:@"%@/%@@%@", owner, repo, [identifier substringToIndex:shortIdentifierLength]];

  NormalizedLaunchDiffUrl normalized;
  normalized.diffUrl = stdString([canonicalUrl stringByAppendingString:@".diff"]);
  normalized.sourceLabel = stdString(label);
  return normalized;
}

bool shouldLaunchPrefetchDiffUrl() {
  NSString* appId = NSProcessInfo.processInfo.environment[@"LEGEND_APP"];
  if (appId.length == 0) {
    id infoValue = NSBundle.mainBundle.infoDictionary[@"LegendAppId"];
    appId = [infoValue isKindOfClass:NSString.class] ? infoValue : nil;
  }
  NSString* bundleIdentifier = NSBundle.mainBundle.bundleIdentifier;
  return [appId isEqualToString:@"diff"] || [bundleIdentifier isEqualToString:@"app.legend.diff.macos"];
}

void startLaunchDiffUrlPrefetchIfNeeded() {
  if (shouldLaunchPrefetchDiffUrl()) {
    NSArray<NSString*>* arguments = NSProcessInfo.processInfo.arguments;
    NSString* value = getLaunchArgumentValue(arguments, @"--diff-url");
    if (!value) {
      value = getLaunchArgumentValue(arguments, @"--diff-source");
    }
    if (!value) {
      value = firstGithubLaunchArgument(arguments);
    }
    if (value.length > 0) {
      auto normalized = normalizeGithubLaunchDiffUrl(value);
      if (normalized.has_value()) {
        margelo::nitro::legenddesktop::diffparser::startLaunchPrefetchedUnifiedDiffUrl(
            normalized->diffUrl,
            normalized->sourceLabel);
      }
    }
  }
}

__attribute__((constructor))
static void HybridDiffLaunchPrefetchConstructor() {
  startLaunchDiffUrlPrefetchIfNeeded();
}

} // namespace
