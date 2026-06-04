import { useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { StyleSheet, View } from "react-native";

type CreateThemeState<TTheme extends string, TColors extends object> = {
  currentTheme: TTheme;
  customColors: TColors;
};

type AppThemeStateObservable<TTheme extends string, TColors extends object> =
  Observable<CreateThemeState<TTheme, TColors>> & {
    currentTheme: any;
    customColors: any;
  };

type CreateThemeJSONManager = <T extends object>(params: {
  filename: string;
  initialValue: T;
  saveDefaultToFile?: boolean;
}) => Observable<T>;

export type AppThemeContextValue<TTheme extends string> = {
  currentTheme: TTheme;
  resetTheme: () => void;
  setTheme: (theme?: TTheme) => void;
};

export type CreateAppThemeOptions<TTheme extends string, TColors extends object> = {
  colors: TColors;
  createJSONManager: CreateThemeJSONManager;
  defaultTheme: TTheme;
  filename?: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function createAppTheme<TTheme extends string, TColors extends object>({
  colors,
  createJSONManager,
  defaultTheme,
  filename = "theme",
}: CreateAppThemeOptions<TTheme, TColors>) {
  const themeState$ = createJSONManager<CreateThemeState<TTheme, TColors>>({
    filename,
    initialValue: {
      currentTheme: defaultTheme,
      customColors: clone(colors),
    },
    saveDefaultToFile: true,
  }) as AppThemeStateObservable<TTheme, TColors>;

  const ThemeContext = createContext<AppThemeContextValue<TTheme> | undefined>(undefined);

  const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const currentTheme = useValue(themeState$.currentTheme);
    useValue(themeState$.customColors);

    if (currentTheme !== defaultTheme) {
      themeState$.currentTheme.set(defaultTheme);
    }

    const contextValue = useMemo<AppThemeContextValue<TTheme>>(
      () => ({
        currentTheme: defaultTheme,
        resetTheme: () => {
          themeState$.customColors.set(clone(colors));
        },
        setTheme: (theme = defaultTheme) => {
          themeState$.currentTheme.set(theme);
        },
      }),
      [],
    );

    return (
      <ThemeContext.Provider value={contextValue}>
        <View className="flex-1" style={styles.root}>
          {children}
        </View>
      </ThemeContext.Provider>
    );
  };

  const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
      throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
  };

  return {
    ThemeProvider,
    themeState$,
    useTheme,
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
