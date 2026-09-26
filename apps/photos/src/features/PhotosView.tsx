import { Photo } from './Photo';
import { isWindowFullScreen$ } from '../hooks/HookWindowFullscreen';
import { usePhotosViewKeyboard } from '../hooks/usePhotosViewKeyboard';
import { getOpenFolder, getPhotosInFolder } from '../plugin-system/FileSources';
import { settings$ } from '../settings/SettingsFile';
import { type PhotoInfo, getFolderName } from '../systems/FileManager';
import { photoMetadatas$ } from '../systems/PhotoMetadata';
import { state, state$ } from '../systems/State';
import { ax } from '../utils/ax';
import { cn } from '../utils/cn';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { observe, syncState } from '@legendapp/state';
import { observer, useValue } from '@legendapp/state/react';
import React, { useCallback, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';


let folderRequest = 0;
// When the open folder changes, update the photos list
observe(async () => {
  const request = ++folderRequest;
  const folder = getOpenFolder();
  state$.selectedPhotoIndex.set(-1);
  state$.fullscreenPhoto.set(null);
  state.photosViewScrollY = 0;
  if (!folder) {
    state$.photos.set([]);
    return;
  }

  // Temporary workaround for scrolling bug
  state$.openingFolder.set(true);

  try {
    const photosList = await getPhotosInFolder(folder);
    if (request === folderRequest) state$.photos.set(photosList);
  } catch (err) {
    console.error('Error loading photos:', err);
  } finally {
    if (request === folderRequest) state$.openingFolder.set(false);
  }
});

const renderPhoto = ({ item, index }: { item: PhotoInfo; index: number }) => {
  return <Photo photo={item} index={index} />;
};

export const PhotosView = observer(function PhotosView() {
  const numColumns = useValue(settings$.state.numColumns);
  const photos = useValue(state$.photos);
  const hasMetadatas = useValue(() => syncState(photoMetadatas$).isPersistLoaded.get());
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const openingFolder = useValue(state$.openingFolder);
  const refList = useRef<LegendListRef>(null);

  // Set up keyboard shortcuts
  usePhotosViewKeyboard(refList);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    state.photosViewScrollY = e.nativeEvent.contentOffset.y;
  }, []);

  if (loading || !hasMetadatas || openingFolder) {
    return (
      <View className="flex-1 justify-center items-center bg-background-primary">
        <Text>Loading photos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-red-500">{error}</Text>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>No photos found in this folder</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-primary">
      <LegendList
        data={photos}
        renderItem={renderPhoto}
        numColumns={numColumns}
        estimatedItemSize={200}
        automaticallyAdjustContentInsets={false}
        recycleItems
        //   drawDistance={1000}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.contentContainerStyle}
        columnWrapperStyle={styles.columnWrapperStyle}
        style={styles.legendListStyle}
        ListHeaderComponent={ListHeaderComponent}
        onScroll={onScroll}
        ref={refList}
      />
    </View>
  );
});

function ListHeaderComponent() {
  const isFullScreen = useValue(isWindowFullScreen$);
  const selectedFolder = useValue(settings$.state.openFolder);
  const photos = useValue(state$.photos);

  let minDate: Date | undefined;
  let maxDate: Date | undefined;
  for (let i = 0; i < photos.length; i++) {
    const ctime = photos[i].ctime;
    if (ctime && (!minDate || ctime < minDate)) {
      minDate = ctime;
    }
    if (ctime && (!maxDate || ctime > maxDate)) {
      maxDate = ctime;
    }
  }
  let dateRange: string | undefined;
  if (minDate && maxDate) {
    if (minDate.getDate() === maxDate.getDate()) {
      dateRange = minDate.toLocaleDateString();
    } else {
      dateRange = `${minDate.toLocaleDateString()} - ${maxDate.toDateString()}`;
    }
  }
  const subtitle = ax(dateRange, `${photos.length} photos`);

  const folderDisplayName = selectedFolder ? getFolderName(selectedFolder) : '';

  return (
    <View className={cn('pb-3', isFullScreen ? 'pt-10' : 'pt-3')}>
      <Text className="text-3xl font-medium text-text-primary">{folderDisplayName}</Text>
      <View className="gap-x-3 flex-row">
        {subtitle.map((t) => (
          <Text key={t} className="text-xs font-medium text-text-secondary pt-2">
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainerStyle: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    margin: 0,
  },
  legendListStyle: {
    flex: 1,
  },
  columnWrapperStyle: {
    gap: 12,
  },
});
