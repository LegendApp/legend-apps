import type { PhotoInfo } from './FileManager';
import { observable } from '@legendapp/state';
import type { View } from 'react-native';

export const fullscreenView = {
  current: null as View | null,
};
export const appView = {
  current: null as View | null,
};
export const state = {
  photosViewScrollY: -28,
};
// Define the interface for the fullscreen photo data
export interface FullscreenPhotoData {
  initialPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export const state$ = observable({
  photos: [] as PhotoInfo[],
  selectedPhotoIndex: -1,
  fullscreenPhoto: null as FullscreenPhotoData | null,
  isPhotoFullscreenCoveringControls: false,
  titleBarHovered: false,
  showSettings: false,
  listeningForKeyPress: false,
  selectedPhoto: () => state$.photos[state$.selectedPhotoIndex.get()],
  openingFolder: false,
});
