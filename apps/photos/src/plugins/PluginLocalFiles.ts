import * as FileSystemWatcher from '../native-modules/FileSystemWatcher';
import type { SourcePlugin } from '../plugin-system/PluginTypes';
import { settings$ } from '../settings/SettingsFile';
import {
  getFolderName,
  listFoldersWithPhotosRecursive,
  listPhotosInFolder,
  scanFolderRecursive,
} from '../systems/FileManager';
import { timeoutOnce } from '../utils/timeoutOnce';
import { event, observable, observe } from '@legendapp/state';

// Event for folder changes detected by file system watcher
const eventFolderChange = event();

const folders$ = observable<string[] | null>(null);

export const PluginLocalFiles: SourcePlugin = {
  id: 'plugin-local-files',
  name: 'Local Files',
  description: 'Access photos from your local file system',
  version: '1.0.0',
  enabled: true,
  type: 'source',
  isLoaded: () => folders$.get() !== null,
  initialize: async () => {
    folders$.get();
    let scanVersion = 0;
    observe(async () => {
      const version = ++scanVersion;
      try {
        // Use the folder change event to trigger refresh
        eventFolderChange.get();
        const libraryPaths = settings$.library.paths.get();

        if (libraryPaths.length > 0) {
          const ret = await listFoldersWithPhotosRecursive(libraryPaths);

          if (version === scanVersion) folders$.set(ret);
        } else {
          folders$.set([]);
        }
      } catch (error) {
        console.error('Error listing folders in LocalFiles plugin:', error);
        if (version === scanVersion) folders$.set([]);
      }
      return [];
    });

    // Initialize file system watcher
    FileSystemWatcher.addChangeListener(() => {
      timeoutOnce('updateFolders', () => eventFolderChange.fire(), 100);
    });
    FileSystemWatcher.setWatchedDirectories(settings$.library.paths.get());

    // Listen for changes to library paths
    settings$.library.paths.onChange(({ value }) => {
      // Update the watched directories
      FileSystemWatcher.setWatchedDirectories(value);
    });
  },

  // Get a list of all folders with photos
  getSidebarGroups: () => {
    const libraryPaths = settings$.library.paths.get();
    const foldersByLibrary: Record<string, Array<{ path: string; depth: number }>> = {};
    const folders = folders$.get() || [];

    for (const path of folders) {
      const parentPath = findParentLibraryPath(path, libraryPaths);
      if (parentPath) {
        if (!foldersByLibrary[parentPath]) {
          foldersByLibrary[parentPath] = [];
        }

        const depth = getRelativeDepth(path, parentPath);
        foldersByLibrary[parentPath].push({ path, depth });
      }
    }

    const sidebarGroups = Object.entries(foldersByLibrary)
      .filter(([_, items]) => items.length > 0)
      .map(([libraryPath, items]) => ({
        title: getFolderName(libraryPath),
        items: items.map(({ path, depth }) => ({
          path,
          text: getFolderName(path),
          depth,
        })),
      }));

    return sidebarGroups;
  },

  // Get photos from a specific folder
  async getPhotos(folderPath: string) {
    try {
      // Use the folder change event to trigger refresh
      eventFolderChange.get();
      return await listPhotosInFolder(folderPath);
    } catch (error) {
      console.error('Error listing photos in LocalFiles plugin:', error);
      return [];
    }
  },

  // Add a path to the library
};

export async function addLibraryPath(path: string): Promise<boolean> {
  try {
    const childFolders = await scanFolderRecursive(path);
    if (childFolders.length > 0) {
      const currentPaths = settings$.library.paths.get();
      if (!currentPaths.includes(path)) {
        settings$.library.paths.push(path);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error adding library path:', error);
    return false;
  }
}

export function removeLibraryPath(path: string) {
  const remaining = settings$.library.paths.peek().filter(item => item !== path);
  settings$.library.paths.set(remaining);
  const openFolder = settings$.state.openFolder.peek();
  const prefix = `${PluginLocalFiles.id}:`;
  if (openFolder?.startsWith(prefix) && !findParentLibraryPath(openFolder.slice(prefix.length), remaining)) {
    settings$.state.openFolder.set(null);
  }
}

// Helper function to find the parent library path for a folder
function findParentLibraryPath(folderPath: string, libraryPaths: string[]): string | undefined {
  // Sort library paths by length (descending) to prioritize more specific paths
  const sortedPaths = [...libraryPaths].sort((a, b) => b.length - a.length);

  // Find the first library path that is a parent of the folder
  return sortedPaths.find((path) => {
    if (folderPath === path) {
      return true;
    }

    const normalizedFolder = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
    return normalizedFolder.startsWith(`${normalizedPath}/`);
  });
}

// Helper function to get folder depth relative to its parent library path
function getRelativeDepth(folderPath: string, parentPath: string): number {
  if (folderPath === parentPath) {
    return 0;
  }

  const normalizedFolder = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  const normalizedPath = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath;

  // If the folder is not a child of the parent path, return 0
  if (!normalizedFolder.startsWith(`${normalizedPath}/`)) {
    return 0;
  }

  // Remove parent path from the folder path and count slashes
  const relativePath = normalizedFolder.slice(normalizedPath.length + 1);
  return relativePath.split('/').length - 1;
}
