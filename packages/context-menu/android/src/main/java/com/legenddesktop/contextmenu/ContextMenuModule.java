package com.legenddesktop.contextmenu;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class ContextMenuModule extends NativeContextMenuSpec {
  public static final String NAME = "NativeContextMenu";

  public ContextMenuModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void showMenu(String itemsJson, String locationJson, Promise promise) {
    promise.resolve("");
  }
}
