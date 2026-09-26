import PhotoKit, { type Album, type PhotoAsset } from '../native-modules/PhotoKit';
import { useCallback, useEffect, useState } from 'react';

interface UsePhotoKitOptions {
  requestPermissionOnMount?: boolean;
}

export function usePhotoKit(options: UsePhotoKitOptions = {}) {
  const { requestPermissionOnMount = false } = options;

  const [permissionStatus, setPermissionStatus] = useState<string>('notDetermined');
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Request permission
  const requestPermissions = useCallback(async () => {
    try {
      const result = await PhotoKit.requestPermissions();
      setPermissionStatus(result.status);
      return result.status;
    } catch (err: any) {
      setError(err.message || 'Failed to request permissions');
      return 'error';
    }
  }, []);

  // Check permission status
  const checkPermissions = useCallback(async () => {
    try {
      const result = await PhotoKit.getPermissionStatus();
      setPermissionStatus(result.status);
      return result.status;
    } catch (err: any) {
      setError(err.message || 'Failed to check permissions');
      return 'error';
    }
  }, []);

  // Get all albums
  const getAlbums = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await PhotoKit.getAlbums();
      setAlbums(result);
      setLoading(false);
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch albums');
      setLoading(false);
      return [];
    }
  }, []);

  // Get photos in an album
  const getPhotosInAlbum = useCallback(
    async (albumIdentifier: string, limit = 0, offset = 0): Promise<PhotoAsset[]> => {
      setLoading(true);
      setError(null);

      try {
        const result = await PhotoKit.getPhotosInAlbum(albumIdentifier, limit, offset);
        setLoading(false);
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to fetch photos');
        setLoading(false);
        return [];
      }
    },
    []
  );

  // Get a specific photo by index
  const getPhotoAtIndex = useCallback(
    async (albumIdentifier: string, index: number): Promise<PhotoAsset | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await PhotoKit.getPhotoAtIndex(albumIdentifier, index);
        setLoading(false);
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to fetch photo');
        setLoading(false);
        return null;
      }
    },
    []
  );

  // Check permissions on mount
  useEffect(() => {
    checkPermissions();

    if (requestPermissionOnMount) {
      requestPermissions();
    }
  }, [checkPermissions, requestPermissionOnMount, requestPermissions]);

  return {
    permissionStatus,
    albums,
    loading,
    error,
    requestPermissions,
    checkPermissions,
    getAlbums,
    getPhotosInAlbum,
    getPhotoAtIndex,
  };
}
