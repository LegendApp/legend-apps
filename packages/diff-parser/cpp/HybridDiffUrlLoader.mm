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

NSURL* createUrl(const std::string& diffUrl) {
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
  return url;
}

NSMutableURLRequest* createDiffUrlRequest(const std::string& diffUrl) {
  NSMutableURLRequest* request = [NSMutableURLRequest requestWithURL:createUrl(diffUrl)];
  request.HTTPMethod = @"GET";
  request.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
  request.timeoutInterval = 60;
  [request setValue:@"Legend Diff" forHTTPHeaderField:@"User-Agent"];
  return request;
}

} // namespace

@interface DiffUrlStreamDelegate : NSObject <NSURLSessionDataDelegate> {
@public
  dispatch_semaphore_t _semaphore;
  std::function<void(std::string_view)> _onChunk;
  std::function<bool()> _shouldCancel;
  std::string _error;
}

- (instancetype)initWithSemaphore:(dispatch_semaphore_t)semaphore
                          onChunk:(std::function<void(std::string_view)>)onChunk
                      shouldCancel:(std::function<bool()>)shouldCancel;

@end

@implementation DiffUrlStreamDelegate

- (instancetype)initWithSemaphore:(dispatch_semaphore_t)semaphore
                          onChunk:(std::function<void(std::string_view)>)onChunk
                      shouldCancel:(std::function<bool()>)shouldCancel
{
  self = [super init];
  if (self) {
    _semaphore = semaphore;
    _onChunk = std::move(onChunk);
    _shouldCancel = std::move(shouldCancel);
  }
  return self;
}

- (void)URLSession:(NSURLSession*)session
          dataTask:(NSURLSessionDataTask*)dataTask
didReceiveResponse:(NSURLResponse*)response
 completionHandler:(void (^)(NSURLSessionResponseDisposition disposition))completionHandler
{
  (void)session;
  if (_shouldCancel && _shouldCancel()) {
    completionHandler(NSURLSessionResponseCancel);
    return;
  }

  if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
    const NSInteger statusCode = [(NSHTTPURLResponse*)response statusCode];
    if (statusCode < 200 || statusCode >= 300) {
      _error = "Failed to fetch diff URL (" + std::to_string(statusCode) + ")";
      completionHandler(NSURLSessionResponseCancel);
      return;
    }
  }

  (void)dataTask;
  completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession*)session
          dataTask:(NSURLSessionDataTask*)dataTask
    didReceiveData:(NSData*)data
{
  (void)session;
  if (_shouldCancel && _shouldCancel()) {
    [dataTask cancel];
    return;
  }

  if (data.length == 0) {
    return;
  }

  try {
    _onChunk(std::string_view(static_cast<const char*>(data.bytes), data.length));
  } catch (const std::exception& error) {
    _error = error.what();
    [dataTask cancel];
  } catch (...) {
    _error = "Failed to parse diff URL";
    [dataTask cancel];
  }
}

- (void)URLSession:(NSURLSession*)session
              task:(NSURLSessionTask*)task
didCompleteWithError:(NSError*)error
{
  (void)session;
  (void)task;
  if (_error.empty() && error != nil && error.code != NSURLErrorCancelled) {
    _error = "Failed to fetch diff URL: " + nsStringToStdString(error.localizedDescription);
  }
  dispatch_semaphore_signal(_semaphore);
}

@end

DiffUrlLoadResult loadDiffUrlText(const std::string& diffUrl) {
  const auto startedAt = UrlClock::now();
  NSMutableURLRequest* request = createDiffUrlRequest(diffUrl);

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

double loadDiffUrlChunks(
    const std::string& diffUrl,
    const std::function<void(std::string_view)>& onChunk,
    const std::function<bool()>& shouldCancel) {
  const auto startedAt = UrlClock::now();
  NSMutableURLRequest* request = createDiffUrlRequest(diffUrl);
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  DiffUrlStreamDelegate* delegate = [[DiffUrlStreamDelegate alloc] initWithSemaphore:semaphore
                                                                             onChunk:onChunk
                                                                         shouldCancel:shouldCancel];
  NSOperationQueue* delegateQueue = [NSOperationQueue new];
  delegateQueue.maxConcurrentOperationCount = 1;
  NSURLSessionConfiguration* configuration = [NSURLSessionConfiguration defaultSessionConfiguration];
  configuration.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
  configuration.timeoutIntervalForRequest = 60;
  configuration.timeoutIntervalForResource = 60;
  NSURLSession* session = [NSURLSession sessionWithConfiguration:configuration
                                                       delegate:delegate
                                                  delegateQueue:delegateQueue];
  NSURLSessionDataTask* task = [session dataTaskWithRequest:request];
  [task resume];

  while (dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC)) != 0) {
    if (shouldCancel && shouldCancel()) {
      [task cancel];
    }
  }

  [session finishTasksAndInvalidate];
  const auto finishedAt = UrlClock::now();

  if (!delegate->_error.empty()) {
    throw std::runtime_error(delegate->_error);
  }

  return elapsedUrlMs(startedAt, finishedAt);
}

} // namespace margelo::nitro::legenddesktop::diffparser
