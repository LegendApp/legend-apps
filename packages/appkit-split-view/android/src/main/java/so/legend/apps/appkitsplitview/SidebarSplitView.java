package so.legend.apps.appkitsplitview;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;

public class SidebarSplitView extends LinearLayout {
  private double sidebarMinWidth = 180;
  private double sidebarWidth = 0;
  private double contentMinWidth = 320;
  private boolean sidebarCollapsed = false;

  public SidebarSplitView(Context context) {
    super(context);
    setOrientation(HORIZONTAL);
  }

  public void setSidebarMinWidth(double value) {
    sidebarMinWidth = value;
    requestLayout();
  }

  public void setSidebarWidth(double value) {
    sidebarWidth = value;
    requestLayout();
  }

  public void setContentMinWidth(double value) {
    contentMinWidth = value;
    requestLayout();
  }

  public void setSidebarCollapsed(boolean value) {
    sidebarCollapsed = value;
    requestLayout();
  }

  @Override
  protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
    int width = MeasureSpec.getSize(widthMeasureSpec);
    int height = MeasureSpec.getSize(heightMeasureSpec);
    int measuredSidebarWidth = sidebarCollapsed ? 0 : getPreferredSidebarWidth(width);
    int contentWidth = Math.max((int) contentMinWidth, width - measuredSidebarWidth);

    if (measuredSidebarWidth + contentWidth > width) {
      contentWidth = Math.max(0, width - measuredSidebarWidth);
    }

    if (getChildCount() > 0) {
      View sidebar = getChildAt(0);
      sidebar.measure(
          MeasureSpec.makeMeasureSpec(measuredSidebarWidth, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }

    if (getChildCount() > 1) {
      View content = getChildAt(1);
      content.measure(
          MeasureSpec.makeMeasureSpec(Math.max(0, width - measuredSidebarWidth), MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
    }

    setMeasuredDimension(width, height);
  }

  @Override
  protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    int width = right - left;
    int height = bottom - top;
    int layoutSidebarWidth = sidebarCollapsed
        ? 0
        : getChildCount() > 0 ? getChildAt(0).getMeasuredWidth() : getPreferredSidebarWidth(width);

    if (getChildCount() > 0) {
      getChildAt(0).layout(0, 0, layoutSidebarWidth, height);
    }

    if (getChildCount() > 1) {
      getChildAt(1).layout(layoutSidebarWidth, 0, width, height);
    }
  }

  private int getPreferredSidebarWidth(int totalWidth) {
    int preferredWidth = sidebarWidth > 0 ? (int) sidebarWidth : (int) (totalWidth * 0.26);
    int maxSidebarWidth = Math.max(0, totalWidth - (int) contentMinWidth);
    return Math.max(0, Math.min(Math.max((int) sidebarMinWidth, preferredWidth), maxSidebarWidth));
  }
}
