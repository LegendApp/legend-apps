package so.legend.apps.sidebar;

import androidx.annotation.Nullable;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.SidebarItemManagerDelegate;
import com.facebook.react.viewmanagers.SidebarItemManagerInterface;

@ReactModule(name = SidebarItemManager.REACT_CLASS)
public class SidebarItemManager extends SimpleViewManager<SidebarItem>
    implements SidebarItemManagerInterface<SidebarItem> {
  public static final String REACT_CLASS = "SidebarItem";

  private final ViewManagerDelegate<SidebarItem> delegate = new SidebarItemManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<SidebarItem> getDelegate() {
    return delegate;
  }

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected SidebarItem createViewInstance(ThemedReactContext context) {
    return new SidebarItem(context);
  }

  @Override
  public void setAutoHeight(SidebarItem view, boolean value) {}

  @Override
  public void setItemId(SidebarItem view, @Nullable String value) {}

  @Override
  public void setRowHeight(SidebarItem view, double value) {}

  @Override
  public void setSelectable(SidebarItem view, boolean value) {}
}
