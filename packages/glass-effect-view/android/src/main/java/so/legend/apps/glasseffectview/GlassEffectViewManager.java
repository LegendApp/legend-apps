package so.legend.apps.glasseffectview;

import androidx.annotation.Nullable;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

@ReactModule(name = GlassEffectViewManager.REACT_CLASS)
public class GlassEffectViewManager extends SimpleViewManager<GlassEffectView> {
  public static final String REACT_CLASS = "RNGlassEffectView";

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected GlassEffectView createViewInstance(ThemedReactContext context) {
    return new GlassEffectView(context);
  }

  @Override
  public void setGlassStyle(GlassEffectView view, @Nullable String value) {
    view.setGlassStyle(value == null ? "regular" : value);
  }

  @Override
  public void setTintColor(GlassEffectView view, @Nullable Integer value) {
    view.setTintColor(value);
  }
}
