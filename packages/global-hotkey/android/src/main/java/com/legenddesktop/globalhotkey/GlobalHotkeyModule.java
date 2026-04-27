package com.legenddesktop.globalhotkey;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class GlobalHotkeyModule extends NativeGlobalHotkeySpec {
  public static final String NAME = "NativeGlobalHotkey";

  public GlobalHotkeyModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void registerHotkey(double keyCode, double modifiers, Promise promise) {
    promise.resolve("{\"success\":true}");
  }

  @Override
  public void unregisterHotkey(Promise promise) {
    promise.resolve("{\"success\":true}");
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
