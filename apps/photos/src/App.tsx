import { ownRegistration } from "@legend-apps/runtime-utils";
import { useEffect } from "react";
import { beforeQuit } from "@legendapp/spark/app";
import { flushPhotoSettings } from "./utils/JSONManager";
import { WindowProvider } from "@legendapp/spark/windows";
import { HookWindowFullscreen } from "./hooks/HookWindowFullscreen";
import { FullscreenPhoto } from './features/FullscreenPhoto';
import { HotkeyHelp } from './features/HotkeyHelp';
import { MainSidebar } from './features/MainSidebar';
import { PhotosViewContainer } from './features/PhotosViewContainer';
import { TitleBar } from './features/TitleBar';
import { PluginRenderer, registerDefaultPlugins } from './plugin-system/registerDefaultPlugins';
import { isSettingsLoaded$ } from './settings/SettingsFile';
import { SettingsWindowManager } from './settings/SettingsWindowManager';
import { initializeMenuManager } from './systems/MenuManager';
import { appView } from './systems/State';
import { initializeUpdater } from './systems/Updater';
import { HookKeyboard } from './systems/keyboard/HookKeyboard';
import { ThemeProvider } from './theme/ThemeProvider';
import { HookWindowDimensions, windowDimensions$ } from './legend-kit/react-native/windowDimensions';
import { useValue } from '@legendapp/state/react';
import type React from 'react';
import { View } from 'react-native';

registerDefaultPlugins();



function App(): React.JSX.Element {
  useEffect(() => {
    const subscription = ownRegistration(beforeQuit(async () => { await flushPhotoSettings(); return true; }));
    const menus = ownRegistration(initializeMenuManager());
    const updater = initializeUpdater();
    return () => { void subscription.remove().catch(console.error); void menus.remove().catch(console.error); void updater.remove().catch(console.error); };
  }, []);
  const settingsLoaded = useValue(isSettingsLoaded$);

  return (
    <WindowProvider id="main"><ThemeProvider>
      <View
        className="flex-1 bg-background-primary"
        ref={(r) => {
          appView.current = r;
        }}
      >
        <View className="flex-1 flex-row">
          <MainSidebar />
          {settingsLoaded && <PhotosViewContainer />}
          <PluginRenderer location="root" className="absolute bottom-4 right-4" />
        </View>
        <FullscreenPhoto />
        <HookWindowDimensions windowDimensions$={windowDimensions$} />
        <HookKeyboard />
        <HookWindowFullscreen />
        <TitleBar />
        <SettingsWindowManager />
        <HotkeyHelp />
        {/* <PhotoKitExample /> */}
      </View>
    </ThemeProvider></WindowProvider>
  );
}

export default App;
