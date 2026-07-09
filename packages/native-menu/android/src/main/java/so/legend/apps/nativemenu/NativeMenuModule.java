package so.legend.apps.nativemenu;

import com.facebook.react.bridge.ReactApplicationContext;

public class NativeMenuModule extends NativeMenuSpec {
  public static final String NAME = "NativeMenu";

  public NativeMenuModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void configureMenus(String ownerId, String menusJson) {}

  @Override
  public void updateMenuItems(String ownerId, String patchesJson) {}

  @Override
  public void clearMenus(String ownerId) {}

  @Override
  public void clearAllMenus() {}

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
