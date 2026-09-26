import { Sidebar } from '../components/Sidebar';
import type { SidebarItem } from '../plugin-system/PluginTypes';
import { GeneralSettings } from './GeneralSettings';
import { HotkeySettings } from './HotkeySettings';
import { LibrarySettings } from './LibrarySettings';
import { PluginSettings } from './PluginSettings';
import { ThemeSettings } from './ThemeSettings';
import { ThemeProvider } from '../theme/ThemeProvider';
import { GlassEffectView as VibrancyView } from "@legendapp/spark/ui/glass";
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

// Define the categories for settings
const SETTING_CATEGORIES: SidebarItem[] = [
  //   { id: 'general', label: 'General' },
  { path: 'library', text: 'Library', depth: 0 },
  { path: 'hotkeys', text: 'Hotkeys', depth: 0 },
  { path: 'themes', text: 'Themes', depth: 0 },
  //   { id: 'plugins', label: 'Plugins' },
  // Add more categories as needed
];

export const SettingsContainer = () => {
  const [selectedCategory, setSelectedCategory] = useState('library');

  const isItemSelected = (item: SidebarItem) => {
    return item.path === selectedCategory;
  };

  const renderContent = () => {
    switch (selectedCategory) {
      case 'general':
        return <GeneralSettings />;
      case 'hotkeys':
        return <HotkeySettings />;
      case 'themes':
        return <ThemeSettings />;
      case 'plugins':
        return <PluginSettings />;
      case 'library':
        return <LibrarySettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <VibrancyView style={styles.vibrancy}>
      <ThemeProvider>
        <View className="flex flex-1 flex-row pt-7">
          <Sidebar
            items={SETTING_CATEGORIES}
            isItemSelected={isItemSelected}
            onSelectItem={(item) => setSelectedCategory(item.path)}
            width={140}
            showGroups={false}
          />
          <View className="flex-1 bg-background-primary">{renderContent()}</View>
        </View>
      </ThemeProvider>
    </VibrancyView>
  );
};

const styles = StyleSheet.create({
  vibrancy: {
    flex: 1,
  },
});
