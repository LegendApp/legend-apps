package com.legenddesktop.glasseffectview;

import android.content.Context;
import android.graphics.Color;
import android.widget.FrameLayout;

public class GlassEffectView extends FrameLayout {
  public GlassEffectView(Context context) {
    super(context);
    setBackgroundColor(Color.argb(128, 255, 255, 255));
  }

  public void setGlassStyle(String glassStyle) {
    if ("clear".equals(glassStyle)) {
      setBackgroundColor(Color.argb(64, 255, 255, 255));
    } else {
      setBackgroundColor(Color.argb(128, 255, 255, 255));
    }
  }

  public void setTintColor(Integer tintColor) {
    if (tintColor != null) {
      setBackgroundColor(tintColor);
    }
  }
}
