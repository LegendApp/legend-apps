package com.legenddesktop.windowmanager;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class WindowManagerModule extends NativeWindowManagerSpec {
  public static final String NAME = "NativeWindowManager";

  public WindowManagerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public String getConstantsJson() {
    return "{}";
  }

  @Override
  public void openWindow(String optionsJson, Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void closeWindow(String identifier, Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void closeFrontmostWindow(Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void showMainWindow(Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void getMainWindowFrame(Promise promise) {
    promise.resolve("{\"x\":0,\"y\":0,\"width\":0,\"height\":0}");
  }

  @Override
  public void setMainWindowFrame(String frameJson, Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void setWindowBlur(String identifier, double radius, double durationMs, Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void setWindowTitle(String identifier, String title, Promise promise) {
    promise.resolve(unavailableJson());
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}

  private String unavailableJson() {
    return "{\"success\":false,\"message\":\"WindowManager is only available on macOS\"}";
  }
}
