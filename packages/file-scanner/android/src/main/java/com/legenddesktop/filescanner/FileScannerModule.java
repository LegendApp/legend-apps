package com.legenddesktop.filescanner;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class FileScannerModule extends NativeFileScannerSpec {
  public static final String NAME = "NativeFileScanner";

  public FileScannerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void scanFiles(String pathsJson, String optionsJson, Promise promise) {
    promise.resolve("{\"totalFiles\":0,\"totalRoots\":0,\"errors\":[]}");
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
