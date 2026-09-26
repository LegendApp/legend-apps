import type { PhotoInfo } from '../systems/FileManager';

export function getPhotoUri(photo: PhotoInfo | null | undefined) {
  if (!photo) {
    return null;
  }
  const { path } = photo;
  return `file://${path}`;
}

export function getPhotoPath(photo: PhotoInfo | null | undefined) {
  if (!photo) {
    return null;
  }
  const { path } = photo;
  return `${path}`;
}
