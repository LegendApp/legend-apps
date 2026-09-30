import { MotionView } from "../components/MotionView";
import { SFSymbol } from '../native-modules/SFSymbol';
import { type HotkeyInfo, hotkeyRegistry$, useOnHotkeys } from '../systems/keyboard/Keyboard';
import { GlassView as VibrancyView } from "@legendapp/spark/ui/glass";
import { LegendList } from '@legendapp/list/react-native';
import { AnimatePresence } from '@legendapp/motion';
import { useObservable, useValue } from '@legendapp/state/react';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const sorter = (a: HotkeyInfo, b: HotkeyInfo) => {
  return a.name.localeCompare(b.name);
};

const SpringOpen = {
  type: 'spring',
  useNativeDriver: false,
  bounciness: 3,
  speed: 36,
} as const;

export function HotkeyHelp() {
  const dims = useWindowDimensions();
  const hotkeyHelpVisible$ = useObservable(false);
  const isVisible = useValue(hotkeyHelpVisible$);
  const hotkeys = useValue(() => Object.values(hotkeyRegistry$.get()).sort(sorter));

  const toggle = () => hotkeyHelpVisible$.toggle();

  // Toggle visibility when / is pressed
  useOnHotkeys({
    Help: toggle,
  });

  return (
    <AnimatePresence>
      {isVisible ? (
        <MotionView
          key="visible"
          className="absolute bottom-0 right-0 py-2 pr-2 z-10"
          style={{ maxHeight: dims.height }}
          initial={{ x: 280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 280, opacity: 0 }}
          transition={SpringOpen}
        >
          <View className="flex-1 overflow-hidden rounded-lg w-64 shadow-lg">
            <VibrancyView
              style={[styles.vibrancyView, { maxHeight: dims.height - 20 }]}
            >
              <View className="flex-row justify-between items-center mb-4 px-4">
                <Text className="text-white text-lg font-bold">Hotkeys</Text>
                {/* TODO: Make this an icon button */}
                <Pressable onPress={toggle}>
                  <SFSymbol name="xmark" size={18} color="#fff" />
                </Pressable>
              </View>
              <LegendList
                style={{ maxHeight: 800 }}
                data={hotkeys}
                renderItem={(props) => <HotkeyHelpItem {...props} />}
                estimatedItemSize={36}
                contentContainerStyle={styles.list}
                //   waitForInitialLayout
              />
            </VibrancyView>
          </View>
        </MotionView>
      ) : (
        <View
          key="button"
          className="absolute bottom-3 right-3 bg-zinc-800 rounded-full size-9 border border-white/10"
        >
          <Pressable onPress={toggle}>
            <SFSymbol name="questionmark" size={20} color="#ddd" style={styles.questionSymbol} />
          </Pressable>
        </View>
      )}
    </AnimatePresence>
  );
}

const HotkeyHelpItem = ({ item }: { item: HotkeyInfo }) => {
  return (
    <View className="h-9 justify-center">
      <View className="flex-row justify-between items-center">
        <Text className="text-white font-medium">{item.name}</Text>
        <View className="bg-zinc-700 px-3 py-1 rounded ml-8">
          <Text className="text-white font-mono text-xs">{item.keyText}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  questionSymbol: {
    position: 'absolute',
    top: 3,
    left: 7,
  },
  list: {
    paddingHorizontal: 16,
  },
  vibrancyView: {
    flex: 1,
    overflow: 'hidden',
    maxHeight: '100%',
    borderRadius: 8,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
});
