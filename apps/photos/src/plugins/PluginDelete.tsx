import { getOpenFolder } from '../plugin-system/FileSources';
import type { DisplayPlugin } from '../plugin-system/PluginTypes';
import { state$ } from '../systems/State';
import React from 'react';
import { Alert, Text, View } from 'react-native';

// Delete component
function DeleteComponent() {
  return (
    <View className="flex-row items-center ml-4">
      <Text className="text-white">Delete Photo: Delete key</Text>
    </View>
  );
}

// Helper function to delete the current photo
const deleteCurrentPhoto = () => {
  const index = state$.selectedPhotoIndex.get();
  const photosList = state$.photos.get();
  const folder = getOpenFolder();

  // Check if we have a valid selection
  if (index === -1 || !photosList.length || !folder || index >= photosList.length) {
    return;
  }

  // Get the photo details
  const photoName = photosList[index];

  // Show confirmation dialog
  Alert.alert(
    'Delete Photo',
    `Are you sure you want to delete "${photoName}"?`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Remove the photo from the list
          const newPhotos = [...photosList];
          newPhotos.splice(index, 1);
          state$.photos.set(newPhotos);

          // If we deleted the last photo in the list, select the new last photo
          if (index >= newPhotos.length && newPhotos.length > 0) {
            state$.selectedPhotoIndex.set(newPhotos.length - 1);
          }

          // If we deleted the only photo, clear selection
          if (newPhotos.length === 0) {
            state$.selectedPhotoIndex.set(-1);
          }

          // Note: In a real implementation, you would also delete the file from disk
          // But that's outside the scope of this example
        },
      },
    ],
    { cancelable: true }
  );
};

// Define the Delete plugin
export const PluginDelete: DisplayPlugin = {
  type: 'display',
  id: 'delete-plugin',
  name: 'Delete Photo',
  description: 'Delete the selected photo with Delete key',
  enabled: true,
  childOf: 'metadata',
  position: 'br',
  component: DeleteComponent,
  hotkeys: {
    'Delete Photo': {
      action: deleteCurrentPhoto,
      description: 'Delete the currently selected photo',
      defaultBinding: "Backspace",
    },
  },
};
