package com.legenddesktop.musictest;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MusicTestPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (MusicTestModule.NAME.equals(name)) {
      return new MusicTestModule(reactContext);
    }
    return null;
  }

  @Override
  public List<ViewManager<?, ?>> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.singletonList(new MusicTestViewManager());
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return new ReactModuleInfoProvider() {
      @Override
      public Map<String, ReactModuleInfo> getReactModuleInfos() {
        Map<String, ReactModuleInfo> map = new HashMap<>();
        map.put(
            MusicTestModule.NAME,
            new ReactModuleInfo(
                MusicTestModule.NAME,
                MusicTestModule.NAME,
                false,
                false,
                false,
                true));
        return map;
      }
    };
  }
}
