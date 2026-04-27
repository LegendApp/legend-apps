package com.legenddesktop.sfsymbol;

import android.content.Context;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.TextView;

public class SFSymbol extends TextView {
  public SFSymbol(Context context) {
    super(context);
    setGravity(Gravity.CENTER);
    setTextColor(Color.rgb(17, 24, 39));
  }

  public void setName(String name) {
    setText(name == null || name.length() == 0 ? "SF" : name);
  }

  public void setSymbolColor(Integer color) {
    if (color != null) {
      setTextColor(color);
    }
  }

  public void setSymbolSize(float size) {
    if (size > 0) {
      setTextSize(size * 0.4f);
    }
  }
}
