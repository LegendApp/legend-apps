package com.legenddesktop.medialibraryscanner;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class MediaLibraryScannerModule extends NativeMediaLibraryScannerSpec {
  public static final String NAME = "NativeMediaLibraryScanner";

  public MediaLibraryScannerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void scanMediaLibrary(String pathsJson, String cacheDir, String optionsJson, Promise promise) {
    promise.resolve("{\"totalTracks\":0,\"totalRoots\":0,\"errors\":[],\"playlists\":[]}");
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
