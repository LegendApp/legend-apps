package com.legenddesktop.glasseffectview;

import androidx.annotation.Nullable;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.GlassEffectViewManagerDelegate;
import com.facebook.react.viewmanagers.GlassEffectViewManagerInterface;

@ReactModule(name = GlassEffectViewManager.REACT_CLASS)
public class GlassEffectViewManager extends SimpleViewManager<GlassEffectView>
    implements GlassEffectViewManagerInterface<GlassEffectView> {
  public static final String REACT_CLASS = "GlassEffectView";

  private final ViewManagerDelegate<GlassEffectView> delegate =
      new GlassEffectViewManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<GlassEffectView> getDelegate() {
    return delegate;
  }

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
