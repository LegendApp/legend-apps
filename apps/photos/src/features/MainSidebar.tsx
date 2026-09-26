import { Sidebar } from '../components/Sidebar';
import {
  type SidebarItemWithSource,
  allSidebarGroups$,
  folderInfoToId,
  getOpenFolder,
  setOpenFolder,
} from '../plugin-system/FileSources';
import type { SidebarItem } from '../plugin-system/PluginTypes';
import { isSettingsLoaded$, settings$ } from '../settings/SettingsFile';
import { useObserveEffect, useValue } from '@legendapp/state/react';
import React from 'react';

export function MainSidebar() {
  const selectedFolderId = useValue(settings$.state.openFolder);
  const sidebarGroups = useValue(allSidebarGroups$) || [];
  const sidebarWidth = useValue(settings$.state.sidebarWidth);

  const isItemSelected = (item: SidebarItem) => {
    return selectedFolderId === folderInfoToId(item as SidebarItemWithSource);
  };

  const onSelectFolder = (item: SidebarItem) => {
    const itemWithSource = item as SidebarItemWithSource;
    setOpenFolder({
      path: itemWithSource.path,
      source: itemWithSource.source,
    });
  };

  useObserveEffect((e) => {
    // If settings are loaded and there's no open folder, select one
    // TODO: Move this out of this file to somewhere more appropriate
    const isSettingsLoaded = isSettingsLoaded$.get();
    if (!selectedFolderId && isSettingsLoaded) {
      const openFolder = getOpenFolder();
      if (openFolder) {
        e.cancel = true;
      } else {
        const allSidebarGroups = allSidebarGroups$.get();
        if (allSidebarGroups?.length) {
          console.log('selecting first folder');
          for (const group of allSidebarGroups) {
            for (const item of group.items) {
              onSelectFolder(item);
              e.cancel = true;
              return;
            }
          }
        }
      }
    }
  });

  return (
    <Sidebar
      items={sidebarGroups}
      isItemSelected={isItemSelected}
      onSelectItem={onSelectFolder}
      width={sidebarWidth}
      showGroups={true}
      className="pt-10"
    />
  );
}
