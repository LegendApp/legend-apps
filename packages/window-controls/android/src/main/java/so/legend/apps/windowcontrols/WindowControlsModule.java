package so.legend.apps.windowcontrols;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class WindowControlsModule extends NativeWindowControlsSpec {
  public static final String NAME = "NativeWindowControls";

  public WindowControlsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void hideWindowControls() {}

  @Override
  public void showWindowControls() {}

  @Override
  public void isWindowFullScreen(Promise promise) {
    promise.resolve(false);
  }

  @Override
  public void addListener(String eventName) {}

  @Override
  public void removeListeners(double count) {}
}
