package com.legenddesktop.sidebar;

import android.content.Context;
import android.graphics.Color;
import android.widget.LinearLayout;

public class Sidebar extends LinearLayout {
  public Sidebar(Context context) {
    super(context);
    setOrientation(VERTICAL);
    setBackgroundColor(Color.TRANSPARENT);
  }
}
