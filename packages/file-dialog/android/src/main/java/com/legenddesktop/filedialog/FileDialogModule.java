package com.legenddesktop.filedialog;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class FileDialogModule extends NativeFileDialogSpec {
  public static final String NAME = "NativeFileDialog";

  public FileDialogModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void open(String optionsJson, Promise promise) {
    promise.resolve("null");
  }

  @Override
  public void save(String optionsJson, Promise promise) {
    promise.resolve("null");
  }

  @Override
  public void revealInFinder(String path, Promise promise) {
    promise.resolve(false);
  }
}
