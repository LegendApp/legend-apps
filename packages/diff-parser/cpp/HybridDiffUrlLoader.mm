#include "HybridDiffUrlLoader.hpp"

#import <Foundation/Foundation.h>

#include <chrono>
#include <stdexcept>

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

using UrlClock = std::chrono::steady_clock;

double elapsedUrlMs(UrlClock::time_point start, UrlClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::string nsStringToStdString(NSString* value) {
  const char* utf8 = [value UTF8String];
  return utf8 != nullptr ? std::string(utf8) : std::string();
}

} // namespace

DiffUrlLoadResult loadDiffUrlText(const std::string& diffUrl) {
  const auto startedAt = UrlClock::now();
  NSString* urlString = [[NSString alloc] initWithBytes:diffUrl.data()
                                                 length:diffUrl.size()
                                               encoding:NSUTF8StringEncoding];
  if (urlString == nil) {
    throw std::runtime_error("Failed to read diff URL");
  }

  NSURL* url = [NSURL URLWithString:urlString];
  if (url == nil) {
    throw std::runtime_error("Invalid diff URL");
  }

  NSMutableURLRequest* request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"GET";
  request.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
  request.timeoutInterval = 60;
  [request setValue:@"Legend Diff" forHTTPHeaderField:@"User-Agent"];

  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  __block NSData* responseData = nil;
  __block NSURLResponse* urlResponse = nil;
  __block NSError* requestError = nil;

  NSURLSessionDataTask* task = [[NSURLSession sharedSession] dataTaskWithRequest:request
                                                               completionHandler:^(NSData* data, NSURLResponse* response, NSError* error) {
    responseData = data;
    urlResponse = response;
    requestError = error;
    dispatch_semaphore_signal(semaphore);
  }];
  [task resume];
  dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

  const auto finishedAt = UrlClock::now();

  if (requestError != nil) {
    throw std::runtime_error("Failed to fetch diff URL: " + nsStringToStdString(requestError.localizedDescription));
  }

  if ([urlResponse isKindOfClass:[NSHTTPURLResponse class]]) {
    const NSInteger statusCode = [(NSHTTPURLResponse*)urlResponse statusCode];
    if (statusCode < 200 || statusCode >= 300) {
      throw std::runtime_error("Failed to fetch diff URL (" + std::to_string(statusCode) + ")");
    }
  }

  if (responseData == nil) {
    throw std::runtime_error("Failed to fetch diff URL");
  }

  DiffUrlLoadResult result;
  result.fetchMs = elapsedUrlMs(startedAt, finishedAt);
  result.text = std::string(static_cast<const char*>(responseData.bytes), responseData.length);
  return result;
}

} // namespace margelo::nitro::legenddesktop::diffparser
