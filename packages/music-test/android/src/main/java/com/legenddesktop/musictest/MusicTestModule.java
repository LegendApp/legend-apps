package com.legenddesktop.musictest;

import com.facebook.react.bridge.ReactApplicationContext;

public class MusicTestModule extends NativeMusicTestSpec {
  public static final String NAME = "NativeMusicTest";

  public MusicTestModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public String getString() {
    return "Music Test Native";
  }
}
