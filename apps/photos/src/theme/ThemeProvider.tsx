import { createJSONManager } from '../utils/JSONManager';
import { observer, useValue, useObserveEffect } from '@legendapp/state/react';
import { Uniwind } from "uniwind";
import * as React from 'react';
import { type ReactNode, createContext, useContext } from 'react';
import { View } from 'react-native';
import { colors } from './colors';

// Define theme types
type ThemeType = 'light' | 'dark';
type ThemeContextType = {
  currentTheme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  resetTheme: () => void;
};

interface ThemeSettings {
  currentTheme: ThemeType;
  customColors: {
    light: typeof colors.light;
    dark: typeof colors.dark;
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// Create a global observable for theme state
export const themeState$ = createJSONManager<ThemeSettings>({
  filename: 'theme.json',
  initialValue: {
    currentTheme: 'dark' as ThemeType,
    customColors: clone(colors),
  },
  saveDefaultToFile: true,
});

// Create context for theme
const ThemeContext = createContext<ThemeContextType>(undefined as any);

// Theme provider component
export const ThemeProvider = observer(({ children }: { children: ReactNode }) => {
  const theme$ = themeState$;
  const theme = useValue(theme$.currentTheme);
  useObserveEffect(() => {
    const theme = theme$.currentTheme.get();
    const custom = theme$.customColors[theme].get();
    Uniwind.setTheme(theme);
    Uniwind.updateCSSVariables(theme, {
      "--color-background-primary": custom.background.primary,
      "--color-background-secondary": custom.background.secondary,
      "--color-background-tertiary": custom.background.tertiary,
      "--color-text-primary": custom.text.primary,
      "--color-text-secondary": custom.text.secondary,
      "--color-text-tertiary": custom.text.tertiary,
      "--color-accent-primary": custom.accent.primary,
      "--color-accent-secondary": custom.accent.secondary,
      "--color-border": custom.border,
    });
  });

  const setTheme = (theme: ThemeType) => {
    theme$.currentTheme.set(theme);
  };

  const resetTheme = () => {
    theme$.customColors.set(clone(colors));
  };

  // Context value
  const contextValue: ThemeContextType = {
    currentTheme: theme,
    setTheme,
    resetTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <View className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
});

// Hook to use theme
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
