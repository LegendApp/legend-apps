package so.legend.apps.appkitsplitview;

import com.facebook.react.bridge.ReactApplicationContext;

public class AppKitSplitViewModule extends NativeAppKitSplitViewSpec {
  public static final String NAME = "NativeAppKitSplitView";

  public AppKitSplitViewModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void configureKitchenSinkMenus(String packagesJson, String testsJson) {}

  @Override
  public void clearKitchenSinkMenus() {}
}
