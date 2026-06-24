package com.legenddesktop.appkitsplitview;

import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.SidebarSplitViewManagerDelegate;
import com.facebook.react.viewmanagers.SidebarSplitViewManagerInterface;

@ReactModule(name = SidebarSplitViewManager.REACT_CLASS)
public class SidebarSplitViewManager extends SimpleViewManager<SidebarSplitView>
    implements SidebarSplitViewManagerInterface<SidebarSplitView> {
  public static final String REACT_CLASS = "SidebarSplitView";

  private final ViewManagerDelegate<SidebarSplitView> delegate =
      new SidebarSplitViewManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<SidebarSplitView> getDelegate() {
    return delegate;
  }

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected SidebarSplitView createViewInstance(ThemedReactContext context) {
    return new SidebarSplitView(context);
  }

  @Override
  public void setSidebarMinWidth(SidebarSplitView view, double value) {
    view.setSidebarMinWidth(value);
  }

  @Override
  public void setContentMinWidth(SidebarSplitView view, double value) {
    view.setContentMinWidth(value);
  }

  @Override
  public void setSidebarCollapsed(SidebarSplitView view, boolean value) {
    view.setSidebarCollapsed(value);
  }
}
