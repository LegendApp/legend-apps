import { getPhotosFixtureLibrary } from "../systems/launch";
import { createJSONManager } from '../utils/JSONManager';
import { syncState } from '@legendapp/state';
import { observable } from '@legendapp/state';

// Define the settings structure
export interface AppSettings {
  // General settings
  general: {
    // theme: 'light' | 'dark' | 'system';
    // language: string;
    autoUpdate: {
      enabled: boolean;
      checkInterval: number; // in hours
    };
  };

  // Hotkey settings
  //   hotkeys: {
  //     [action: string]: string;
  //   };

  // Theme settings
  //   themes: {
  //     customThemes: Array<{
  //       name: string;
  //       colors: Record<string, string>;
  //     }>;
  //     activeTheme: string;
  //   };

  // Plugin settings
  //   plugins: {
  //     enabled: Record<string, boolean>;
  //     settings: Record<string, any>;
  //   };

  // Library settings
  library: {
    paths: string[];
    // previewSize: 'small' | 'medium' | 'large';
    // showFilenames: boolean;
    // sortBy: 'name' | 'date' | 'size' | 'type';
    // sortDirection: 'asc' | 'desc';
  };
  // State
  state: {
    openFolder: string | null;
    sidebarWidth: number;
    isSidebarOpen: boolean;
    numColumns: number;
    showFilmstrip: boolean;
  };
}

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  general: {
    // theme: 'system',
    // language: 'en',
    autoUpdate: {
      enabled: true,
      checkInterval: 24, // Check for updates once a day by default
    },
  },
  //   hotkeys: {},
  //   themes: {
  //     customThemes: [],
  //     activeTheme: 'default',
  //   },
  //   plugins: {
  //     enabled: {},
  //     settings: {},
  //   },
  library: {
    paths: getPhotosFixtureLibrary() ? [getPhotosFixtureLibrary()!] : [],
    // previewSize: 'medium',
    // showFilenames: true,
    // sortBy: 'date',
    // sortDirection: 'desc',
  },
  state: {
    openFolder: null,
    sidebarWidth: 160,
    isSidebarOpen: false,
    numColumns: 4,
    showFilmstrip: true,
  },
};

// Create the settings manager
export const settings$ = createJSONManager<AppSettings>({
  filename: 'settings.json',
  initialValue: DEFAULT_SETTINGS,
  saveDefaultToFile: true,
});

export const isSettingsLoaded$ = observable(() => !!syncState(settings$).isPersistLoaded.get());
