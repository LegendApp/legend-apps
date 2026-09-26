import { Button } from '../native-modules/Button';
import { FilePicker } from '../native-modules/FilePicker';
import { addLibraryPath } from '../plugins/PluginLocalFiles';
import { settings$ } from './SettingsFile';
import { useSelector } from '@legendapp/state/react';
import React from 'react';
import { Text, View } from 'react-native';

export const LibrarySettings = () => {
  const librarySettings = useSelector(settings$.library);

  const handleAddFolderPath = (path: string) => {
    addLibraryPath(path);
  };

  const handleRemovePath = async (path: string) => {
    const currentPaths = settings$.library.paths.get();
    const idx = currentPaths.indexOf(path);
    settings$.library.paths.splice(idx, 1);
  };

  //   const handlePreviewSizeChange = async (size: 'small' | 'medium' | 'large') => {
  //     settings$.library.previewSize.set(size);
  //   };

  //   const handleShowFilenamesChange = async (show: boolean) => {
  //     settings$.library.showFilenames.set(show);
  //   };

  //   const handleSortChange = async (sortBy: 'name' | 'date' | 'size' | 'type') => {
  //     settings$.library.sortBy.set(sortBy);
  //   };

  //   const handleSortDirectionChange = async (sortDirection: 'asc' | 'desc') => {
  //     settings$.library.sortDirection.set(sortDirection);
  //   };

  return (
    <View className="space-y-8 p-5">
      <Text className="text-2xl font-bold text-white mb-2">Library Settings</Text>

      {/* Library Paths */}
      <View className="pb-8">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-base font-medium text-white">Library Paths</Text>
          <FilePicker
            title="Add Folder"
            onFileSelected={handleAddFolderPath}
            pickFolder={true}
            bezelStyle="rounded"
            controlSize="regular"
          />
        </View>

        <View className="gap-y-2">
          {librarySettings.paths.length > 0 ? (
            librarySettings.paths.map((path) => (
              <View
                key={path}
                className="flex-row items-center justify-between bg-[#222] p-2 rounded-md border border-[#444]"
              >
                <Text className="text-white">{path}</Text>
                <Button
                  title="Remove"
                  bezelStyle="textured"
                  controlSize="regular"
                  onPress={() => handleRemovePath(path)}
                />
              </View>
            ))
          ) : (
            <View className="py-3 px-4 bg-[#222] rounded-md border border-[#444]">
              <Text className="text-gray-400 text-center">No library paths added yet</Text>
            </View>
          )}
        </View>
      </View>

      {/* Preview Size */}
      {/* <View className="pb-8 w-64">
        <Text className="text-base font-medium text-white mb-6">Preview Size</Text>
        <SegmentedControl
          options={['small', 'medium', 'large'] as const}
          selectedValue={librarySettings.previewSize}
          onValueChange={handlePreviewSizeChange}
          labelExtractor={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
          size="large"
        />
      </View> */}

      {/* Show Filenames */}
      {/* <View className="pb-8 w-32">
        <Text className="text-base font-medium text-white mb-6">Show Filenames</Text>
        <Switch value={librarySettings.showFilenames} onValueChange={handleShowFilenamesChange} />
      </View> */}

      {/* Sort Options */}
      {/* <View className="pb-8 w-64">
        <Text className="text-base font-medium text-white mb-6">Sort By</Text>
        <SegmentedControl
          options={['name', 'date', 'size', 'type'] as const}
          selectedValue={librarySettings.sortBy}
          onValueChange={handleSortChange}
          labelExtractor={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
          size="large"
        />
      </View> */}

      {/* Sort Direction */}
      {/* <View className="w-56">
        <Text className="text-base font-medium text-white mb-6">Sort Direction</Text>
        <SegmentedControl
          options={['asc', 'desc'] as const}
          selectedValue={librarySettings.sortDirection}
          onValueChange={handleSortDirectionChange}
          labelExtractor={(value) => (value === 'asc' ? 'Ascending' : 'Descending')}
          size="large"
        />
      </View> */}
    </View>
  );
};
