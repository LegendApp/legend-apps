import { FilePicker } from '../native-modules/FilePicker';
import { SFSymbol } from '../native-modules/SFSymbol';
import { addLibraryPath } from '../plugins/PluginLocalFiles';
import React from 'react';
import { Text, View } from 'react-native';

export function EmptyLibrary() {
  const handleFolderSelected = async (path: string) => {
    addLibraryPath(path);
  };

  return (
    <View className="flex-1 items-center justify-center p-8 bg-gray-50 dark:bg-zinc-900">
      <View className="max-w-md w-full bg-white dark:bg-zinc-800 rounded-2xl p-10 items-center border border-white/10">
        <View className="w-28 h-28 mb-8 items-center justify-center bg-gray-100 dark:bg-gray-700/50 rounded-full">
          <SFSymbol name="photo.on.rectangle.angled" size={52} color="#64748b" />
        </View>

        <Text className="text-2xl font-bold mb-3 text-gray-800 dark:text-gray-100 text-center">
          Your Photo Library is Empty
        </Text>

        <Text className="text-base text-gray-600 dark:text-gray-400 mb-10 text-center">
          Add a folder containing your photos to get started with your collection
        </Text>

        <FilePicker
          title="Add Folder"
          bezelStyle="rounded"
          controlSize="large"
          pickFolder={true}
          onFileSelected={handleFolderSelected}
        />
      </View>
    </View>
  );
}
