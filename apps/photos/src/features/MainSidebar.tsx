import { Sidebar } from '../components/Sidebar';
import {
  type SidebarItemWithSource,
  allSidebarGroups$,
  folderInfoToId,
  getOpenFolder,
  getAllSidebarGroups,
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

  useObserveEffect(() => {
    if (isSettingsLoaded$.get() && !getOpenFolder()) {
      // Read current source groups so removed paths cannot be reselected from an old async result.
      const first = getAllSidebarGroups().flatMap(group => group.items)[0];
      if (first) setOpenFolder({path: first.path, source: first.source});
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
