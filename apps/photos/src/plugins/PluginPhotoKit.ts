import { isPhotosTestSession } from "../systems/launch";
import { photoKitAlbumPath, photoKitAlbumIdentifier } from "../utils/photoKitPaths";
import PhotoKit, { type Album, type PhotoAsset } from '../native-modules/PhotoKit';
import type { SourcePlugin } from '../plugin-system/PluginTypes';
import type { PhotoInfo } from '../systems/FileManager';
import { event, observable } from '@legendapp/state';

// Event for PhotoKit library changes
export const eventPhotoKitChange = event();

// Observable for albums
const albums$ = observable<Album[] | null>(null);

// Convert PhotoAsset to PhotoInfo by adapting to the expected fields
function photoAssetToPhotoInfo(asset: PhotoAsset): PhotoInfo {
  // Create a compatible PhotoInfo object
  return {
    id: asset.identifier,
    name: asset.filename,
    path: asset.uri,
    size: 0, // Not directly available from PhotoKit
    isDirectory: () => false,
    isFile: () => true,
    mtime: new Date(asset.modificationDate),
    ctime: new Date(asset.creationDate),
    // Additional properties will be safely added to the object
    // even if not in the formal interface definition
    metadata: {
      width: asset.width,
      height: asset.height,
      isFavorite: asset.isFavorite,
      mediaType: asset.mediaType,
    },
  } as PhotoInfo;
}

export const PluginPhotoKit: SourcePlugin = {
  id: 'plugin-photokit',
  name: 'Photos Library',
  description: 'Access photos from your macOS Photos app',
  version: '1.0.0',
  enabled: true,
  type: 'source',
  isLoaded: () => albums$.get() !== null,

  initialize: async () => {
    if (isPhotosTestSession()) { albums$.set([]); return; }
    try {
      // Check permissions
      const permissionResult = await PhotoKit.getPermissionStatus();

      if (permissionResult.status === 'authorized') {
        // Load albums when permission is granted
        const albumsData = await PhotoKit.getAlbums();
        albums$.set(albumsData);
      } else {
        // We'll use a simple approach for now without settings dependency
        // In a real implementation, we would add a proper setting to the AppSettings interface
        const requestResult = await PhotoKit.requestPermissions();

        if (requestResult.status === 'authorized') {
          const albumsData = await PhotoKit.getAlbums();
          albums$.set(albumsData);
        }
      }
    } catch (error) {
      console.error('Error initializing PhotoKit plugin:', error);
    } finally {
      if (albums$.peek() === null) albums$.set([]);
    }
  },

  // Get a list of all albums (treated as folders in the plugin system)
  getSidebarGroups: () => {
    // Get event to trigger refresh when needed
    eventPhotoKitChange.get();

    const albums = albums$.get() || [];

    return albums.length > 0
      ? [
          {
            title: 'Apple Photos',
            items: albums.map((album) => ({
              path: photoKitAlbumPath(album.identifier, album.title),
              text: album.title,
              depth: 0,
            })),
          },
        ]
      : [];
  },

  // Get photos from a specific album
  async getPhotos(folderPath: string): Promise<PhotoInfo[]> {
    try {
      // Get event to trigger refresh when needed
      eventPhotoKitChange.get();

      // Check if this is a PhotoKit path
      if (!folderPath.startsWith('photokit://')) {
        return [];
      }

      // Extract album identifier from the path
      const albumId = photoKitAlbumIdentifier(folderPath);

      // Get photos from the album (limit to 1000 for performance)
      const photos = await PhotoKit.getPhotosInAlbum(albumId, 1000, 0);

      // Convert to PhotoInfo format
      return photos.map(photoAssetToPhotoInfo);
    } catch (error) {
      console.error('Error getting photos from PhotoKit album:', error);
      return [];
    }
  },
};

// Function to manually refresh the album list
export async function refreshPhotoKitAlbums(): Promise<boolean> {
  try {
    const permissionResult = await PhotoKit.getPermissionStatus();

    if (permissionResult.status === 'authorized') {
      const albumsData = await PhotoKit.getAlbums();
      albums$.set(albumsData);
      eventPhotoKitChange.fire();
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error refreshing PhotoKit albums:', error);
    return false;
  }
}

// Function to request PhotoKit permissions
export async function requestPhotoKitPermissions(): Promise<boolean> {
  try {
    const result = await PhotoKit.requestPermissions();

    if (result.status === 'authorized') {
      const albumsData = await PhotoKit.getAlbums();
      albums$.set(albumsData);
      eventPhotoKitChange.fire();
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error requesting PhotoKit permissions:', error);
    return false;
  }
}
