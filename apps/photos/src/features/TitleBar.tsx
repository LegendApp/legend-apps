import { MotionView } from "../components/MotionView";
import { settings$ } from '../settings/SettingsFile';
import { state$ } from '../systems/State';
import { GlassEffectView as VibrancyView } from "@legendapp/spark/ui/glass";
import { AnimatePresence } from '@legendapp/motion';
import { observe } from '@legendapp/state';
import { Show } from '@legendapp/state/react';
import { Pressable, StyleSheet } from 'react-native';
import * as WindowControls from "@legendapp/spark/windows/controls";

export function TitleBar() {
  const onHover = () => {
    state$.titleBarHovered.set(true);
  };

  const onHoverLeave = () => {
    state$.titleBarHovered.set(false);
  };

  return (
    <Pressable
      className="absolute top-0 left-0 right-0 h-[28px] z-[1000]"
      onPointerMove={onHover}
      onHoverIn={onHover}
      onHoverOut={onHoverLeave}
    >
      <Show if={state$.titleBarHovered} wrap={AnimatePresence}>
        <MotionView
          className="absolute inset-0 border-b border-border"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'tween', duration: 100 }}
        >
          <VibrancyView
            style={styles.vibrancy}
          />
        </MotionView>
      </Show>
    </Pressable>
  );
}

observe(() => {
  const isPhotoFullscreenCoveringControls = state$.isPhotoFullscreenCoveringControls.get();
  const isSidebarOpen = settings$.state.isSidebarOpen.get();

  const hide =
    !state$.titleBarHovered.get() && (isPhotoFullscreenCoveringControls || !isSidebarOpen);
  if (hide) {
    WindowControls.hideWindowControls();
  } else {
    setTimeout(() => {
      WindowControls.showWindowControls();
    }, 100);
  }
});

const styles = StyleSheet.create({
  vibrancy: {
    flex: 1,
  },
});
