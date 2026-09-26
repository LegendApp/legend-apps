import { Img } from '../components/Img';
import type { PhotoInfo } from '../systems/FileManager';
import { state$ } from '../systems/State';
import { windowDimensions$ } from '../legend-kit/react-native/windowDimensions';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { observer, useObserveEffect, useSelector } from '@legendapp/state/react';
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

// Set up NativeWind for LegendList

interface FilmstripItemProps {
  item: PhotoInfo;
  index: number;
  size: number;
}

const FilmstripItem = observer(({ item, index, size }: FilmstripItemProps) => {
  const isSelected = useSelector(() => state$.selectedPhotoIndex.get() === index);

  const handlePress = () => {
    state$.selectedPhotoIndex.set(index);
  };

  return (
    <Pressable onPress={handlePress} className="mx-1 py-2 rounded-md overflow-hidden">
      <View
        className="rounded-md overflow-hidden border-accent-primary"
        style={[isSelected ? styles.selectedItem : null, { width: size, height: size }]}
      >
        <Img photo={item} className="w-full h-full" resizeMode={'cover'} native={false} />
      </View>
    </Pressable>
  );
});

export const Filmstrip = observer(() => {
  const photos = useSelector(state$.photos);
  const listRef = useRef<LegendListRef>(null);
  const width = useSelector(windowDimensions$.width);
  const thumbnailSize = 80;
  const isFirstRender = useRef(true);
  const initialScrollIndex = state$.selectedPhotoIndex.peek();

  useObserveEffect(() => {
    const index = state$.selectedPhotoIndex.get();
    if (index >= 0 && listRef.current) {
      listRef.current.scrollToIndex({
        index: index,
        animated: !isFirstRender.current,
        viewPosition: 0.5, // Center the item
      });
      isFirstRender.current = false;
    }
  });

  const renderItem = useCallback(({ item, index }: { item: PhotoInfo; index: number }) => {
    return <FilmstripItem item={item} index={index} size={thumbnailSize} />;
  }, []);

  const keyExtractor = useCallback((item: PhotoInfo) => item.id, []);

  return (
    <View className="px-2" style={{ height: thumbnailSize + 16 }}>
      <LegendList
        ref={listRef}
        data={photos}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        recycleItems
        initialScrollOffset={Math.max(0, initialScrollIndex * 88 - (width - 100) / 2)} // 100 is 88 plus some buffer to center it
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{padding: 8}}
        estimatedItemSize={88} // 64px for item + 8px for margin
        style={{
          width,
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  selectedItem: {
    borderWidth: 2,
  },
});
