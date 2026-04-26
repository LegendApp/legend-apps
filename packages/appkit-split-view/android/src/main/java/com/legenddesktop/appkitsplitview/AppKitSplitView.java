package com.legenddesktop.appkitsplitview;

import android.content.Context;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AppKitSplitView extends LinearLayout {
  private final TextView sidebar;
  private final TextView main;

  public AppKitSplitView(Context context) {
    super(context);
    setOrientation(HORIZONTAL);

    sidebar = new TextView(context);
    sidebar.setGravity(Gravity.CENTER);
    sidebar.setText("Sidebar");
    sidebar.setBackgroundColor(Color.rgb(238, 240, 244));

    main = new TextView(context);
    main.setGravity(Gravity.CENTER);
    main.setText("Main Content");
    main.setBackgroundColor(Color.WHITE);

    addView(sidebar, new LayoutParams(0, LayoutParams.MATCH_PARENT, 1));
    addView(main, new LayoutParams(0, LayoutParams.MATCH_PARENT, 3));
  }

  public void setSidebarTitle(String title) {
    sidebar.setText(title);
  }

  public void setMainTitle(String title) {
    main.setText(title);
  }
}
