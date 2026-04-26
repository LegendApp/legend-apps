package com.legenddesktop.appkitsplitview;

import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.AppKitSplitViewManagerDelegate;
import com.facebook.react.viewmanagers.AppKitSplitViewManagerInterface;

@ReactModule(name = AppKitSplitViewManager.REACT_CLASS)
public class AppKitSplitViewManager extends SimpleViewManager<AppKitSplitView>
    implements AppKitSplitViewManagerInterface<AppKitSplitView> {
  public static final String REACT_CLASS = "AppKitSplitView";

  private final ViewManagerDelegate<AppKitSplitView> delegate =
      new AppKitSplitViewManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<AppKitSplitView> getDelegate() {
    return delegate;
  }

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected AppKitSplitView createViewInstance(ThemedReactContext context) {
    return new AppKitSplitView(context);
  }

  @Override
  public void setSidebarTitle(AppKitSplitView view, String value) {
    view.setSidebarTitle(value == null ? "Sidebar" : value);
  }

  @Override
  public void setMainTitle(AppKitSplitView view, String value) {
    view.setMainTitle(value == null ? "Main Content" : value);
  }

  @Override
  public void setUsesLiquidGlass(AppKitSplitView view, boolean value) {}
}
