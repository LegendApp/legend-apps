import { AnimatedView } from "./AnimatedView";
import { SidebarButton } from './SidebarButton';
import type { SidebarGroup, SidebarItem } from '../plugin-system/PluginTypes';
import { cn } from '../utils/cn';
import { GlassView as VibrancyView } from "@legendapp/spark/ui/glass";
import React from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

interface SidebarCommonProps {
  items: SidebarItem[] | SidebarGroup[];
  isItemSelected: (item: SidebarItem) => boolean;
  onSelectItem: (item: SidebarItem) => void;
  width?: number | Animated.Value;
  showGroups?: boolean;
  className?: string;
}

export function Sidebar({
  items,
  isItemSelected,
  onSelectItem,
  width = 140,
  showGroups = false,
  className,
}: SidebarCommonProps) {
  const isGrouped = (item: SidebarItem | SidebarGroup): item is SidebarGroup => {
    return 'items' in item && 'title' in item;
  };

  const renderItems = () => {
    if (showGroups && items.some(isGrouped)) {
      return (items as SidebarGroup[]).map((group) => (
        <View key={group.title} className="mb-6">
          <View className="mb-1">
            <Text className="px-3 text-xs font-semibold tracking-wider text-text-tertiary">
              {group.title}
            </Text>
          </View>

          {group.items.map((item) => (
            <View key={item.path} className="relative">
              <SidebarButton
                key={item.path}
                text={item.text}
                isSelected={isItemSelected(item)}
                onPress={() => onSelectItem(item)}
                indentLevel={item.depth || 0}
              />
            </View>
          ))}
        </View>
      ));
    }

    return (items as SidebarItem[]).map((item) => (
      <SidebarButton
        key={item.path}
        text={item.text}
        isSelected={isItemSelected(item)}
        onPress={() => onSelectItem(item)}
        indentLevel={item.depth || 0}
      />
    ));
  };

  return (
    <AnimatedView
      className="h-full border-r border-border"
      style={{
        width,
      }}
    >
      <VibrancyView style={styles.vibrancy}>
        <View className={cn('flex-1 py-2', className)}>
          <ScrollView showsVerticalScrollIndicator={false}>{renderItems()}</ScrollView>
        </View>
      </VibrancyView>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  vibrancy: {
    flex: 1,
  },
});
