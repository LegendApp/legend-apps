import { getStoredString, setStoredString } from "@legend-desktop/app-storage";

const SETTINGS_VERSION = 1;
const STORAGE_KEY = "music.settings.v1";

export type MusicSettings = Readonly<{
  general: Readonly<{
    autoCheckForUpdates: boolean;
    globalHotkeyEnabled: boolean;
    nowPlayingOverlayEnabled: boolean;
    showQueueOnLaunch: boolean;
  }>;
  library: Readonly<{
    autoScanOnStart: boolean;
    rootPaths: readonly string[];
  }>;
  updatedAt: number;
  version: number;
}>;

export type MusicSettingsState = MusicSettings & Readonly<{
  loaded: boolean;
}>;

type MusicSettingsPatch = Partial<{
  general: Partial<MusicSettings["general"]>;
  library: Partial<MusicSettings["library"]>;
}>;

const subscribers = new Set<() => void>();

let settings: MusicSettingsState = createDefaultSettings(false);
let loadPromise: Promise<MusicSettingsState> | undefined;

function createDefaultSettings(loaded: boolean, now = Date.now()): MusicSettingsState {
  return {
    general: {
      autoCheckForUpdates: true,
      globalHotkeyEnabled: false,
      nowPlayingOverlayEnabled: true,
      showQueueOnLaunch: true,
    },
    library: {
      autoScanOnStart: true,
      rootPaths: [],
    },
    loaded,
    updatedAt: now,
    version: SETTINGS_VERSION,
  };
}

function emit() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function uniquePaths(paths: readonly string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of paths) {
    const trimmed = path.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      unique.push(trimmed);
    }
  }

  return unique;
}

function parseSettings(json: string | null): MusicSettingsState {
  const defaults = createDefaultSettings(true);
  if (!json) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(json) as Partial<MusicSettings>;
    return {
      general: {
        autoCheckForUpdates: parsed.general?.autoCheckForUpdates !== false,
        globalHotkeyEnabled: Boolean(parsed.general?.globalHotkeyEnabled),
        nowPlayingOverlayEnabled: parsed.general?.nowPlayingOverlayEnabled !== false,
        showQueueOnLaunch: parsed.general?.showQueueOnLaunch !== false,
      },
      library: {
        autoScanOnStart: parsed.library?.autoScanOnStart !== false,
        rootPaths: Array.isArray(parsed.library?.rootPaths)
          ? uniquePaths(parsed.library.rootPaths.filter((path): path is string => typeof path === "string"))
          : [],
      },
      loaded: true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      version: SETTINGS_VERSION,
    };
  } catch {
    return defaults;
  }
}

function serializableSettings(value: MusicSettingsState): MusicSettings {
  return {
    general: value.general,
    library: value.library,
    updatedAt: value.updatedAt,
    version: SETTINGS_VERSION,
  };
}

export function getMusicSettingsSnapshot() {
  return settings;
}

export function subscribeMusicSettings(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function loadMusicSettings() {
  loadPromise ??= getStoredString(STORAGE_KEY).then((json) => {
    settings = parseSettings(json);
    emit();
    return settings;
  });
  return loadPromise;
}

export async function saveMusicSettings(nextSettings: MusicSettings) {
  settings = {
    ...nextSettings,
    loaded: true,
    updatedAt: Date.now(),
    version: SETTINGS_VERSION,
  };
  emit();
  await setStoredString(STORAGE_KEY, JSON.stringify(serializableSettings(settings)));
  return settings;
}

export async function updateMusicSettings(patch: MusicSettingsPatch) {
  return saveMusicSettings({
    ...settings,
    general: {
      ...settings.general,
      ...patch.general,
    },
    library: {
      ...settings.library,
      ...patch.library,
      rootPaths: patch.library?.rootPaths ? uniquePaths(patch.library.rootPaths) : settings.library.rootPaths,
    },
  });
}
