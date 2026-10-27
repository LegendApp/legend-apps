import { useValue } from "@legendapp/state/react";
import { SettingsRow, SettingsSection } from "@legendapp/spark/settings/window";
import { NativeVideoView } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { mkdir } from "@legendapp/spark/files";
import type { EffectCatalog, EffectListing, PackPin } from "../../../packages/presentation/src/effectPacks/schema";
import { RuntimeButton } from "./CompilerRuntimePrompt";
import { loadDeck } from "./deckLoader";
import { runEffectCommand } from "./effectCommands";
import { catalogResource, effectPackRows, effectsDirectory, loadEffectCatalog, readInstalledEffectPacks, type EffectPackRow } from "./effectLibrary";
import { effectRequests$ } from "./effectRequests";
import { slidesState$ } from "./slidesStore";

type Catalog = { catalog: EffectCatalog; url: string } | { error: string } | null;
const stateLabel = { available: "Not installed", installed: "Installed", update: "Update available", incompatible: "Incompatible with this app" } as const;

function EffectCard({ effect, catalogURL }: { effect: EffectListing; catalogURL: string }) {
  const [playing, setPlaying] = useState(false);
  const poster = effect.preview && catalogResource(effect.preview.poster, catalogURL);
  const video = effect.preview?.video && catalogResource(effect.preview.video, catalogURL);
  return <View className="w-56 gap-1">
    <Pressable accessibilityRole="button" accessibilityLabel={video ? `${playing ? "Pause" : "Play"} ${effect.title} preview` : `${effect.title} preview`}
      disabled={!video} onPress={() => setPlaying(value => !value)} className="h-32 overflow-hidden rounded-md bg-neutral-800">
      {playing && video && poster ? <NativeVideoView source={video} poster={poster} playing />
        : poster ? <Image source={{ uri: poster }} resizeMode="cover" style={{ width: "100%", height: "100%" }} /> : null}
      {video && !playing ? <Text className="absolute bottom-1 right-2 text-xs text-white">▶ Preview</Text> : null}
    </Pressable>
    <Text className="text-sm font-semibold text-text-primary">{effect.title}</Text>
    <Text className="text-xs text-text-secondary" numberOfLines={3}>{effect.description}</Text>
  </View>;
}

function EffectProgress() {
  const message = useValue(effectRequests$.message), progress = useValue(effectRequests$.progress);
  const percent = progress ? Math.round(progress.receivedBytes / progress.totalBytes * 100) : 0;
  const text = progress ? `${message} ${progress.pack} ${progress.receivedBytes.toLocaleString()} / ${progress.totalBytes.toLocaleString()} bytes (${percent}%)` : message;
  return <View className="gap-2">
    <Text className="text-sm text-foreground">{text}</Text>
    <View accessibilityRole="progressbar" accessibilityLabel={text} accessibilityValue={{ min: 0, max: 100, now: percent }} className="h-1 rounded bg-[#303948]">
      <View className="h-1 rounded bg-[#7dd3fc]" style={{ width: `${percent}%` }} />
    </View>
  </View>;
}

export function EffectsSettingsPage() {
  const [installed, setInstalled] = useState<Record<string, PackPin> | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(null);
  const catalogRequest = useRef(0);
  const busy = useValue(effectRequests$.busy), message = useValue(effectRequests$.message), error = useValue(effectRequests$.error), progress = useValue(effectRequests$.progress);
  const presenting = useValue(() => slidesState$.deckLocked.get() || slidesState$.audienceOpen.get());
  const refreshInstalled = () => effectsDirectory().then(readInstalledEffectPacks).then(setInstalled, () => setInstalled({}));
  const refreshCatalog = () => {
    const request = ++catalogRequest.current;
    setCatalog(null);
    loadEffectCatalog().then(value => { if (request === catalogRequest.current) setCatalog(value); },
      (failure: unknown) => { if (request === catalogRequest.current) setCatalog({ error: failure instanceof Error ? failure.message : String(failure) }); });
  };
  useEffect(() => { void refreshInstalled(); refreshCatalog(); return () => { catalogRequest.current++; }; }, []);

  const run = (args: string[], working: string, done: string) => {
    void runEffectCommand(args, working, done, "settings").then(() => {
      // A deck waiting on optional effects retries with the new selection.
      const pending = effectRequests$.pending.peek();
      if (pending) void loadDeck(pending.path);
    }, () => { /* The page shows effectRequests$.error. */ }).finally(refreshInstalled);
  };
  const install = (row: EffectPackRow) => run(["--effect-action", `legend-slides://effects/install?pack=${row.id}&version=${row.latest}`],
    `${row.installed ? "Updating" : "Installing"} ${row.id} ${row.latest}…`, `${row.installed ? "Updated" : "Installed"} ${row.id} ${row.latest}. It is available offline.`);
  const remove = (row: EffectPackRow) => Alert.alert(`Remove ${row.id}?`, "Decks that use it will offer to install it again.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => run(["--remove-effect", row.id], `Removing ${row.id}…`, `Removed ${row.id}.`) },
  ]);

  const loaded = catalog && "catalog" in catalog ? catalog : null;
  const rows = installed ? effectPackRows(loaded?.catalog ?? null, installed) : [];
  const disabled = busy || presenting;
  return <>
    <SettingsSection first title="Effect Packs">
      <SettingsRow title="Installed effects" description="Packs install into Application Support and work offline. Decks keep the version they were built with."
        control={<RuntimeButton title="Open Folder" onPress={() => void effectsDirectory().then(async directory => { await mkdir(directory, { recursive: true }); await Linking.openURL(`file://${encodeURI(directory)}`); }).catch(console.error)} />} />
      {!catalog && <SettingsRow title="Catalog" description="Loading effects from legend.so…" control={null} />}
      {catalog && "error" in catalog && <SettingsRow title="Catalog unavailable" description={`Showing installed packs only. ${catalog.error}`}
        control={<RuntimeButton title="Try Again" onPress={refreshCatalog} />} />}
      {presenting && <SettingsRow title="Presenting" description="Finish presenting to install, update or remove effects." control={null} />}
      {busy || message && progress ? <View className="px-4 py-4"><EffectProgress /></View>
        : error ? <SettingsRow title="Effect operation failed" description={error} control={null} />
        : message ? <SettingsRow title={message} control={null} /> : null}
    </SettingsSection>
    {rows.map(row => <SettingsSection key={row.id} title={row.id[0].toUpperCase() + row.id.slice(1)}
      description={`${stateLabel[row.state]}${row.installed ? ` · ${row.installed.version}` : ""}${row.latest && row.state !== "installed" ? ` · Latest ${row.latest}` : ""}${row.incompatibility ? ` · ${row.incompatibility}` : ""}${row.effects.length ? ` · ${row.effects.map(effect => effect.title).join(", ")}` : ""}`}
      headerRight={<View className="flex-row gap-2">
        {row.latest && row.state !== "installed" && row.state !== "incompatible" ? <RuntimeButton title={row.state === "update" ? `Update to ${row.latest}` : "Install"} disabled={disabled} onPress={() => install(row)} /> : null}
        {row.installed ? <RuntimeButton title="Remove" disabled={disabled} onPress={() => remove(row)} /> : null}
      </View>}>
      {loaded && row.effects.length ? <ScrollView horizontal contentContainerStyle={{ gap: 16, padding: 16 }}>
        {row.effects.map(effect => <EffectCard key={effect.slug} effect={effect} catalogURL={loaded.url} />)}
      </ScrollView> : null}
    </SettingsSection>)}
  </>;
}
