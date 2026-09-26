import { getSourcePlugins } from './PluginManager';
import type { SidebarItem } from './PluginTypes';
import { settings$ } from '../settings/SettingsFile';
import type { PhotoInfo } from '../systems/FileManager';
import { observable } from '@legendapp/state';

// Define the folder info interface
export interface FolderInfo {
  path: string;
  source: string;
}

/**
 * Convert FolderInfo to a string ID in format "source:path"
 */
export function folderInfoToId(info: FolderInfo): string {
  return `${info.source}:${info.path}`;
}

/**
 * Parse a folder ID string back to FolderInfo
 */
export function parseFolderId(id: string): FolderInfo {
  const [source, ...pathParts] = id.split(':');
  return {
    source,
    path: pathParts.join(':'), // Rejoin in case path contains colons
  };
}

export const allSidebarGroups$ = observable(async () => {
  return getAllSidebarGroups();
});

export interface SidebarGroupWithSource {
  title: string;
  items: SidebarItemWithSource[];
}

export interface SidebarItemWithSource extends SidebarItem {
  source: string;
}

export function areSourcesLoaded(): boolean {
  const sourcePlugins = getSourcePlugins();
  return sourcePlugins.every((plugin) => plugin.isLoaded());
}

/**
 * Get all folders with photos from all enabled source plugins
 * @returns Promise with an array of folder info objects
 */
export function getAllSidebarGroups(): SidebarGroupWithSource[] {
  try {
    const sourcePlugins = getSourcePlugins();

    if (sourcePlugins.length === 0) {
      console.warn('No source plugins are registered or enabled');
      return [];
    }

    // Get folders from all source plugins with their source IDs
    const results = sourcePlugins.map((plugin) => {
      const groups = plugin.getSidebarGroups();
      // Map each folder path to an object with path and source
      return groups.map(({ title, items }) => ({
        title,
        items: items.map((item) => ({
          source: plugin.id,
          ...item,
        })),
      }));
    });

    // Flatten and sort the results by path
    return results.flat();
  } catch (error) {
    console.error('Error getting folders from source plugins:', error);
    return [];
  }
}

/**
 * Get photos in a specific folder
 * @param folderId - The folder ID string in format "source:path"
 * @returns Promise with an array of photo info objects
 */
export async function getPhotosInFolder(folder: FolderInfo): Promise<PhotoInfo[]> {
  try {
    const { source, path } = folder;
    const sourcePlugins = getSourcePlugins();

    if (sourcePlugins.length === 0) {
      console.warn('No source plugins are registered or enabled');
      return [];
    }

    // Try to use the specified source plugin
    if (source) {
      const plugin = sourcePlugins.find((p) => p.id === source);
      if (plugin) {
        return plugin.getPhotos(path);
      }
    }

    return [];
  } catch (error) {
    console.error('Error getting photos from source plugins:', error);
    return [];
  }
}

/**
 * Get the currently open folder as a FolderInfo object
 * @returns The folder info, or null if no folder is open
 */
export function getOpenFolder(): FolderInfo | null {
  const folderId = settings$.state.openFolder.get();
  if (!folderId) {
    return null;
  }
  return parseFolderId(folderId);
}

export function setOpenFolder(folder: FolderInfo): void {
  settings$.state.openFolder.set(folderInfoToId(folder));
}
