package so.legend.apps.sfsymbol;

import androidx.annotation.Nullable;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.SFSymbolManagerDelegate;
import com.facebook.react.viewmanagers.SFSymbolManagerInterface;

@ReactModule(name = SFSymbolManager.REACT_CLASS)
public class SFSymbolManager extends SimpleViewManager<SFSymbol>
    implements SFSymbolManagerInterface<SFSymbol> {
  public static final String REACT_CLASS = "SFSymbol";

  private final ViewManagerDelegate<SFSymbol> delegate = new SFSymbolManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<SFSymbol> getDelegate() {
    return delegate;
  }

  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  protected SFSymbol createViewInstance(ThemedReactContext context) {
    return new SFSymbol(context);
  }

  @Override
  public void setName(SFSymbol view, String value) {
    view.setName(value);
  }

  @Override
  public void setColor(SFSymbol view, @Nullable Integer value) {
    view.setSymbolColor(value);
  }

  @Override
  public void setScale(SFSymbol view, @Nullable String value) {}

  @Override
  public void setSize(SFSymbol view, float value) {
    view.setSymbolSize(value);
  }

  @Override
  public void setYOffset(SFSymbol view, float value) {}
}
