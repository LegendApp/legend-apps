package com.legenddesktop.musictest;

import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.MusicTestViewManagerDelegate;
import com.facebook.react.viewmanagers.MusicTestViewManagerInterface;

@ReactModule(name = MusicTestViewManager.REACT_CLASS)
public class MusicTestViewManager extends SimpleViewManager<MusicTestView>
    implements MusicTestViewManagerInterface<MusicTestView> {
  public static final String REACT_CLASS = "MusicTestView";

  private final ViewManagerDelegate<MusicTestView> delegate =
      new MusicTestViewManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<MusicTestView> getDelegate() {
    return delegate;
  }

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected MusicTestView createViewInstance(ThemedReactContext context) {
    return new MusicTestView(context);
  }
}
