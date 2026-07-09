package so.legend.apps.appkitsplitview;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.uimanager.ViewManager;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class AppKitSplitViewPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (AppKitSplitViewModule.NAME.equals(name)) {
      return new AppKitSplitViewModule(reactContext);
    }
    return null;
  }

  @Override
  public List<ViewManager<?, ?>> createViewManagers(ReactApplicationContext reactContext) {
    return Arrays.asList(new SidebarSplitViewManager());
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return new ReactModuleInfoProvider() {
      @Override
      public Map<String, ReactModuleInfo> getReactModuleInfos() {
        Map<String, ReactModuleInfo> map = new HashMap<>();
        map.put(
            AppKitSplitViewModule.NAME,
            new ReactModuleInfo(
                AppKitSplitViewModule.NAME,
                AppKitSplitViewModule.NAME,
                false,
                false,
                false,
                true));
        return map;
      }
    };
  }
}
