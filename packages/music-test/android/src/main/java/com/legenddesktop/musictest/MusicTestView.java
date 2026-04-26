package com.legenddesktop.musictest;

import android.content.Context;
import android.view.Gravity;
import android.widget.TextView;

public class MusicTestView extends TextView {
  public MusicTestView(Context context) {
    super(context);
    setGravity(Gravity.CENTER);
    setText("Music Test Native");
  }
}
