package com.legenddesktop.appkitsplitview;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;

public class SidebarSplitView extends LinearLayout {
  private double sidebarMinWidth = 180;
  private double contentMinWidth = 320;

  public SidebarSplitView(Context context) {
    super(context);
    setOrientation(HORIZONTAL);
  }

  public void setSidebarMinWidth(double value) {
    sidebarMinWidth = value;
    requestLayout();
  }

  public void setContentMinWidth(double value) {
    contentMinWidth = value;
    requestLayout();
  }

  @Override
  protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
    int width = MeasureSpec.getSize(widthMeasureSpec);
    int height = MeasureSpec.getSize(heightMeasureSpec);
    int sidebarWidth = Math.max((int) sidebarMinWidth, (int) (width * 0.26));
    int contentWidth = Math.max((int) contentMinWidth, width - sidebarWidth);

    if (sidebarWidth + contentWidth > width) {
      contentWidth = Math.max(0, width - sidebarWidth);
    }

    if (getChildCount() > 0) {
      View sidebar = getChildAt(0);
      sidebar.measure(
          MeasureSpec.makeMeasureSpec(sidebarWidth, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }

    if (getChildCount() > 1) {
      View content = getChildAt(1);
      content.measure(
          MeasureSpec.makeMeasureSpec(Math.max(0, width - sidebarWidth), MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }

    setMeasuredDimension(width, height);
  }

  @Override
  protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    int width = right - left;
    int height = bottom - top;
    int sidebarWidth = getChildCount() > 0 ? getChildAt(0).getMeasuredWidth() : Math.max((int) sidebarMinWidth, (int) (width * 0.26));

    if (getChildCount() > 0) {
      getChildAt(0).layout(0, 0, sidebarWidth, height);
    }

    if (getChildCount() > 1) {
      getChildAt(1).layout(sidebarWidth, 0, width, height);
    }
  }
}
