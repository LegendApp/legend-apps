import { observer, useSelector } from '@legendapp/state/react';
import React from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { AutoUpdaterModule } from '../native-modules/AutoUpdater';
import { settings$ } from './SettingsFile';

export const GeneralSettings = observer(function GeneralSettings() {
  const { enabled: autoUpdateEnabled$, checkInterval: autoUpdateInterval$ } =
    settings$.general.autoUpdate;

  const autoUpdateEnabled = useSelector(autoUpdateEnabled$);
  const autoUpdateInterval = useSelector(autoUpdateInterval$);

  const handleIntervalChange = (text: string) => {
    let value = Number.parseInt(text || '0', 10);
    if (Number.isNaN(value) || value < 1) {
      value = 1;
    }
    autoUpdateInterval$.set(value);
  };

  return (
    <View>
      <Text className="text-2xl font-bold text-white mb-5">General Settings</Text>

      {/* Auto-Update Settings */}
      <View className="mb-4">
        <Text className="text-lg font-semibold text-white mb-2">Auto Update</Text>

        <View className="flex-row items-center mb-2">
          <Text className="text-white flex-1">Check for updates automatically</Text>
          <Switch
            value={autoUpdateEnabled}
            onValueChange={(value) => autoUpdateEnabled$.set(value)}
          />
        </View>

        {autoUpdateEnabled && (
          <View className="flex-row items-center mb-2">
            <Text className="text-white flex-1">Check interval (hours)</Text>
            <TextInput
              className="bg-gray-700 text-white px-2 py-1 rounded w-20 text-right"
              value={autoUpdateInterval.toString()}
              onChangeText={handleIntervalChange}
              keyboardType="number-pad"
            />
          </View>
        )}

        <View className="mt-2">
          <Text
            className="text-blue-400 underline"
            onPress={() => AutoUpdaterModule.checkForUpdates()}
          >
            Check for updates now
          </Text>
        </View>
      </View>

      {/* Other general settings would go here */}
    </View>
  );
});
