package com.legenddesktop.audioplayer;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class AudioPlayerModule extends NativeAudioPlayerSpec {
  public static final String NAME = "NativeAudioPlayer";

  public AudioPlayerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  private String success() {
    return "{\"success\":true}";
  }

  private String unsupported() {
    return "{\"success\":false,\"error\":\"AudioPlayer is not implemented on Android yet\"}";
  }

  @Override
  public void loadTrack(String filePath, Promise promise) {
    promise.resolve(unsupported());
  }

  @Override
  public void play(Promise promise) {
    promise.resolve(unsupported());
  }

  @Override
  public void pause(Promise promise) {
    promise.resolve(success());
  }

  @Override
  public void stop(Promise promise) {
    promise.resolve(success());
  }

  @Override
  public void seek(double seconds, Promise promise) {
    promise.resolve(unsupported());
  }

  @Override
  public void setVolume(double volume, Promise promise) {
    promise.resolve(success());
  }

  @Override
  public void getCurrentState(Promise promise) {
    promise.resolve("{\"currentTime\":0,\"duration\":0,\"isPlaying\":false,\"volume\":1}");
  }

  @Override
  public void updateNowPlayingInfo(String payloadJson) {}

  @Override
  public void clearNowPlayingInfo() {}

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
