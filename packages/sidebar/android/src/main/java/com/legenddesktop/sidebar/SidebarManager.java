package com.legenddesktop.sidebar;

import androidx.annotation.Nullable;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.SidebarManagerDelegate;
import com.facebook.react.viewmanagers.SidebarManagerInterface;

@ReactModule(name = SidebarManager.REACT_CLASS)
public class SidebarManager extends SimpleViewManager<Sidebar>
    implements SidebarManagerInterface<Sidebar> {
  public static final String REACT_CLASS = "Sidebar";

  private final ViewManagerDelegate<Sidebar> delegate = new SidebarManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<Sidebar> getDelegate() {
    return delegate;
  }

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected Sidebar createViewInstance(ThemedReactContext context) {
    return new Sidebar(context);
  }

  @Override
  public void setContentInsetTop(Sidebar view, double value) {}

  @Override
  public void setDefaultRowHeight(Sidebar view, double value) {}

  @Override
  public void setItemsJson(Sidebar view, @Nullable String value) {}

  @Override
  public void setSelectedId(Sidebar view, @Nullable String value) {}
}
