import Native from "./NativePhotoLibrary";

export interface PhotoAsset {
  identifier: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  creationDate: string;
  modificationDate: string;
  mediaType: 'image' | 'video';
  isFavorite: boolean;
}

export interface Album {
  identifier: string;
  title: string;
  assetCount: number;
  type: 'smartAlbum' | 'userCreated';
}

export interface PhotoKitPermissionStatus {
  status: 'authorized' | 'denied' | 'restricted' | 'notDetermined';
}

const parse = async <T>(value: Promise<string>): Promise<T> => JSON.parse(await value);
const PhotoKit = {
  requestPermissions: () => parse<PhotoKitPermissionStatus>(Native.requestPermissions()),
  getPermissionStatus: () => parse<PhotoKitPermissionStatus>(Native.getPermissionStatus()),
  getAlbums: () => parse<Album[]>(Native.getAlbums()),
  getPhotosInAlbum: (identifier: string, limit = 1000, offset = 0) => parse<PhotoAsset[]>(Native.getPhotosInAlbum(identifier, limit, offset)),
  getPhotoAtIndex: (identifier: string, index: number) => parse<PhotoAsset | null>(Native.getPhotoAtIndex(identifier, index)),
};
export default PhotoKit;
