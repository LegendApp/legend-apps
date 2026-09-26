import { MotionView } from "../components/MotionView";
import { EmptyLibrary } from './EmptyLibrary';
import { PhotosView } from './PhotosView';
import { allSidebarGroups$, areSourcesLoaded, getOpenFolder } from '../plugin-system/FileSources';
import { PluginRenderer } from '../plugin-system/registerDefaultPlugins';
import { settings$ } from '../settings/SettingsFile';
import { state$ } from '../systems/State';
import { useOnHotkeys } from '../systems/keyboard/Keyboard';
import { useValue } from '@legendapp/state/react';
import type React from 'react';

const SpringOpen = {
  type: 'spring',
  bounciness: 3,
  speed: 36,
} as const;

const SpringClose = {
  type: 'spring',
  bounciness: 2,
  speed: 36,
} as const;

export function PhotosViewContainer() {
  const sidebarWidth = useValue(
    () => (settings$.state.isSidebarOpen.get() && settings$.state.sidebarWidth.get()) || 0
  );
  const isEmpty = useValue(() => {
    const groups = allSidebarGroups$.get();
    const isLoaded = areSourcesLoaded();

    return isLoaded && groups?.length === 0;
  });

  useOnHotkeys({
    Sidebar: () => {
      const selectedFolder = getOpenFolder();

      if (selectedFolder && !state$.fullscreenPhoto.get()) {
        settings$.state.isSidebarOpen.toggle();
      }
    },
  });

  return (
    <MotionView
      className="absolute top-0 bottom-0 right-0"
      initial={{ left: sidebarWidth }}
      animate={{ left: sidebarWidth }}
      transition={sidebarWidth > 0 ? SpringOpen : SpringClose}
    >
      {isEmpty ? <EmptyLibrary /> : <PhotosView />}

      {/* Plugins for the photosGrid location */}
      <PluginRenderer location="photosGrid" className="absolute top-4 right-4" />
    </MotionView>
  );
}
