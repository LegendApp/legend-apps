package com.legenddesktop.appexit;

import com.facebook.react.bridge.ReactApplicationContext;

public class AppExitModule extends NativeAppExitSpec {
  public static final String NAME = "NativeAppExit";

  public AppExitModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public boolean isSupported() {
    return false;
  }

  @Override
  public void requestExit() {}

  @Override
  public void completeExit(boolean allow) {}

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
