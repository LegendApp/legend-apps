import type { DisplayPlugin } from '../plugin-system/PluginTypes';
import { state$ } from '../systems/State';
import { GlassView as VibrancyView } from "@legendapp/spark/ui/glass";
import { useValue } from '@legendapp/state/react';
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

interface PhotoInfoProps {
  style: ViewStyle;
}
/**
 * Component that shows the name and created date of the currently selected photo
 */
function PhotoInfo({ style }: PhotoInfoProps) {
  const selectedPhoto = useValue(state$.selectedPhoto);

  if (!selectedPhoto) {
    return null;
  }

  // Format the creation date if available
  let creationDate = 'Date unknown';

  if (selectedPhoto.mtime) {
    try {
      const date = new Date(selectedPhoto.mtime);
      creationDate = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      console.error('Error formatting date:', e);
    }
  }

  return (
    <View style={style} className="flex items-center pt-2">
      <VibrancyView
        style={styles.vibrancyView}
      >
        <View className="px-4 py-1 rounded-md flex-row items-center gap-x-4">
          <Text className="text-white font-medium text-sm text-center">{selectedPhoto.name}</Text>
          <Text className="text-white/80 text-xs text-center">{creationDate}</Text>
        </View>
      </VibrancyView>
    </View>
  );
}

// Export plugin configuration
export const PluginFullscreenPhotoInfo: DisplayPlugin = {
  type: 'display',
  id: 'photo-info',
  name: 'Photo Info',
  description: 'Displays the name and created date of the currently selected photo',
  enabled: true,
  childOf: 'photoFullscreen',
  component: PhotoInfo,
  position: 't',
};

const styles = StyleSheet.create({
  vibrancyView: {
    flex: 1,
    borderRadius: 8,
  },
});
