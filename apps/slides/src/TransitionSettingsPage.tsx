import { SelectControl } from "@legend-apps/design-system";
import { setTitleAnimationSpeedSetting, useTitleAnimationSpeedSetting } from "./slidesSettings";
import { builtinTransitionSources } from "@legend-apps/presentation";
import { SettingsRow, SettingsSection } from "@legendapp/spark/settings/window";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { watch } from "@legendapp/spark/files";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { copyLibraryTransitionToDeck } from "./deckLoader";
import { duplicateTransition, getTransitionDirectory, listTransitions, restoreTransition, transitionDirectoryPath, transitionStorage } from "./transitionLibrary";

function Action({ title, run }: { title: string; run(): void }) {
  return <Pressable accessibilityRole="button" onPress={run} className="rounded-md bg-neutral-700 px-3 py-2"><Text className="text-white">{title}</Text></Pressable>;
}
function TitleAnimationSpeedRow() {
  const speed = useTitleAnimationSpeedSetting();
  return <SettingsRow title="Title Animation Speed" description="Playback speed for animated title entrances."
    control={<SelectControl accessibilityLabel="Title animation speed" value={speed} onChange={setTitleAnimationSpeedSetting}
      options={[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map(value => ({ value, label: `${value}×` }))} />} />;
}

export function TransitionSettingsPage() {
  const [names, setNames] = useState(listTransitions);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const watcher = ownRegistration(watch(transitionDirectoryPath(), () => setNames(listTransitions()), { recursive: true }));
    return () => { void watcher.remove().catch(console.error); };
  }, []);
  const run = (action: () => string | void | Promise<string | void>) => {
    void Promise.resolve().then(action).then((result) => { setNames(listTransitions()); setMessage(result ?? "Done"); }).catch((error) => setMessage(String(error)));
  };
  return <>
    <SettingsSection first title="Title Animations">
      <TitleAnimationSpeedRow />
    </SettingsSection>
    <SettingsSection title="Transitions">
      <SettingsRow title="Your transition library" description="Edit TypeScript files or add new ones. Changes rebuild open decks; updates wait until the presentation ends."
        control={<Action title="Open Folder" run={() => run(() => Linking.openURL(getTransitionDirectory().uri))} />} />
      {names.map((name) => <SettingsRow key={name} title={name} controlWrapperClassName="max-w-80" control={<View className="flex-row flex-wrap justify-end gap-2">
        <Action title="Edit" run={() => run(() => Linking.openURL(transitionStorage.file(`transitions/${name}.ts`).uri))} />
        <Action title="Duplicate" run={() => run(() => `Created ${duplicateTransition(name)}.ts`)} />
        {name in builtinTransitionSources && <Action title="Restore" run={() => run(() => { restoreTransition(name); return "Restored built-in; previous version saved as a copy"; })} />}
        <Action title="Copy into Deck" run={() => run(() => copyLibraryTransitionToDeck(name))} />
      </View>} />)}
      <Text className="text-neutral-400">Copy into Deck bundles helper files and updates references in the saved deck. Duplicate any transition to start a new one.</Text>
      {message ? <Text accessibilityLiveRegion="polite" className="mt-3 text-white">{message}</Text> : null}
    </SettingsSection>
  </>;
}
