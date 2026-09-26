import { SFSymbol } from '../native-modules/SFSymbol';
import { getOpenFolder } from '../plugin-system/FileSources';
import type { DisplayPlugin, PhotoPluginProps } from '../plugin-system/PluginTypes';
import type { PhotoInfo } from '../systems/FileManager';
import { type PhotoMetadataItem, photoMetadatas$, updateMetadata } from '../systems/PhotoMetadata';
import { state$ } from '../systems/State';
import { KeyCodes } from '../systems/keyboard/KeyboardManager';
import type { Observable } from '@legendapp/state';
import { use$ } from '@legendapp/state/react';
import React from 'react';
import { View } from 'react-native';

const handleFlagToggle = async (
  photo: PhotoInfo,
  photoMetadata$: Observable<PhotoMetadataItem>
) => {
  const metadata = photoMetadata$.get();
  const newValue: PhotoMetadataItem = { flag: !metadata?.flag };
  if (newValue.flag && metadata?.reject) {
    newValue.reject = false;
  }
  await updateMetadata(photo, newValue);
};

const handleRejectToggle = (photo: PhotoInfo, photoMetadata$: Observable<PhotoMetadataItem>) => {
  const metadata = photoMetadata$.get();
  const newValue: PhotoMetadataItem = { reject: !metadata?.reject };
  if (newValue.reject && metadata?.flag) {
    newValue.flag = false;
  }
  updateMetadata(photo, newValue);
};

// Flag/Reject component
function FlagRejectComponent({ photo, style }: PhotoPluginProps) {
  const photoMetadata$ = photoMetadatas$[photo.id];
  const photoMetadata = photoMetadata$.get();

  return (
    <View className="flex-row items-center gap-x-1 h-8 pl-2" style={style}>
      {photoMetadata.flag && <SFSymbol name="flag.fill" size={16} color="white" />}
      {photoMetadata.reject && <SFSymbol name="flag.fill" size={16} color="#d00" />}
    </View>
  );
}

const getCurrentPhoto = () => {
  const index = state$.selectedPhotoIndex.get();
  const photosList = state$.photos.get();
  const folder = getOpenFolder();

  if (index === -1 || !photosList.length || !folder || index >= photosList.length) {
    // Check if we have a valid selection
    return {};
  }

  // Get the photo details
  const photo = photosList[index];

  const photoMetadata$ = photoMetadatas$[photo.id];
  return { photo, photoMetadata$ };
};

// Helper function to toggle flag on the current photo
const toggleFlagCurrentPhoto = () => {
  const { photo, photoMetadata$ } = getCurrentPhoto();
  if (photo) {
    handleFlagToggle(photo, photoMetadata$);
  }
};

// Helper function to toggle reject on the current photo
const toggleRejectCurrentPhoto = () => {
  const { photo, photoMetadata$ } = getCurrentPhoto();
  if (photo) {
    handleRejectToggle(photo, photoMetadata$);
  }
};

// Define the Flag/Reject plugin
export const PluginFlagReject: DisplayPlugin = {
  type: 'display',
  id: 'flag-reject-plugin',
  name: 'Flag & Reject',
  description: 'Flag photos with Space, reject with X',
  enabled: true,
  childOf: 'photo',
  position: 'bl',
  component: FlagRejectComponent,
  shouldRender: ({ photo }: PhotoPluginProps) => {
    const photoMetadata$ = photoMetadatas$[photo.id];
    const photoMetadata = photoMetadata$.get();

    return !!(photoMetadata && (photoMetadata.flag || photoMetadata.reject));
  },
  hotkeys: {
    'Toggle Flag': {
      action: toggleFlagCurrentPhoto,
      description: 'Toggle flag on the selected photo',
      defaultKeyCode: KeyCodes.KEY_SPACE,
    },
    'Toggle Flag-2': {
      action: toggleFlagCurrentPhoto,
      description: 'Toggle flag on the selected photo',
      defaultKeyCode: KeyCodes.KEY_P,
    },
    'Toggle Reject': {
      action: toggleRejectCurrentPhoto,
      description: 'Toggle reject status on the selected photo',
      defaultKeyCode: KeyCodes.KEY_X,
    },
  },
};
