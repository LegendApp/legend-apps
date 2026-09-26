import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";
export interface Spec extends TurboModule {
  requestPermissions(): Promise<string>;
  getPermissionStatus(): Promise<string>;
  getAlbums(): Promise<string>;
  getPhotosInAlbum(identifier: string, limit: number, offset: number): Promise<string>;
  getPhotoAtIndex(identifier: string, index: number): Promise<string>;
}
export default TurboModuleRegistry.getEnforcing<Spec>("NativePhotoLibrary");
