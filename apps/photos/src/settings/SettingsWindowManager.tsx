import { useWindowManager } from "@legendapp/spark/windows/managed";
import { createWindowsNavigator, createDocumentWindowStyle } from "@legendapp/spark/windows/react";
import { useEffect } from "react";
import { state$ } from "../systems/State";
const windows = createWindowsNavigator({ PhotosSettings: {
  identifier: "photos-settings",
  loadComponent: () => import("./SettingsContainer").then(module => ({default: module.SettingsContainer})),
  options: { title: "Photos Settings", windowStyle: createDocumentWindowStyle({frame: {width: 680, height: 680, minWidth: 560, minHeight: 440}, includeFrame: true}) },
}});
export function SettingsWindowManager() {
  const manager = useWindowManager();
  useEffect(() => {
    const dispose = state$.showSettings.onChange(({value}) => {
      void (value ? windows.open("PhotosSettings") : windows.close("PhotosSettings")).catch(error => { console.error(error); state$.showSettings.set(false); });
    });
    const subscription = manager.onWindowClosed(({identifier}) => {
      if (identifier === "photos-settings") state$.showSettings.set(false);
    });
    return () => { dispose(); subscription.remove(); };
  }, [manager]);
  return null;
}
