import { useEffect } from "react";
import { addAppExitListener, completeAppExit } from "@legendapp/spark/app/exit";
import { flushPhotoSettings } from "./utils/JSONManager";
import { WindowProvider } from "@legendapp/spark/windows/react";
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
import { useSelector } from '@legendapp/state/react';
import type React from 'react';
import { View } from 'react-native';

registerDefaultPlugins();
initializeUpdater();
initializeMenuManager();


function App(): React.JSX.Element {
  useEffect(() => {
    const subscription = addAppExitListener(() => {
      void flushPhotoSettings().then(() => completeAppExit(true), error => { console.error(error); completeAppExit(false); });
    });
    return () => subscription.remove();
  }, []);
  const settingsLoaded = useSelector(isSettingsLoaded$);

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
        <TitleBar />
        <SettingsWindowManager />
        <HotkeyHelp />
        {/* <PhotoKitExample /> */}
      </View>
    </ThemeProvider></WindowProvider>
  );
}

export default App;
