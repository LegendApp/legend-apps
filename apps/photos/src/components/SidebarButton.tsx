import { cn } from '../utils/cn';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export interface SidebarButtonProps {
  text: string;
  isSelected: boolean;
  onPress: () => void;
  indentLevel?: number;
}

export function SidebarButton({ text, isSelected, onPress, indentLevel = 0 }: SidebarButtonProps) {
  const textColor = isSelected ? 'text-text-primary' : 'text-text-secondary';

  const indentPadding = 8 + indentLevel * 12;

  return (
    <Pressable
      className={cn(
        'py-2 rounded-md mx-1',
        isSelected ? 'bg-accent-primary/20' : 'hover:bg-background-secondary'
      )}
      onPress={onPress}
    >
      <View className="flex-row items-center" style={{ paddingLeft: indentPadding }}>
        <Text className={cn('text-sm', textColor, isSelected && 'font-medium')}>{text}</Text>
      </View>
    </Pressable>
  );
}
