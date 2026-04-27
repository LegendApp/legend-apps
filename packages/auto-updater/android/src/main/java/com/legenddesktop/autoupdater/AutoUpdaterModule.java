package com.legenddesktop.autoupdater;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class AutoUpdaterModule extends NativeAutoUpdaterSpec {
  public static final String NAME = "NativeAutoUpdater";

  public AutoUpdaterModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public boolean isAvailable() {
    return false;
  }

  @Override
  public void checkForUpdates(Promise promise) {
    promise.resolve(false);
  }

  @Override
  public void checkForUpdatesInBackground(Promise promise) {
    promise.resolve(false);
  }

  @Override
  public void getAutomaticallyChecksForUpdates(Promise promise) {
    promise.resolve(false);
  }

  @Override
  public void setAutomaticallyChecksForUpdates(boolean value, Promise promise) {
    promise.resolve(false);
  }

  @Override
  public void getUpdateCheckInterval(Promise promise) {
    promise.resolve(0);
  }

  @Override
  public void setUpdateCheckInterval(double interval, Promise promise) {
    promise.resolve(false);
  }
}
