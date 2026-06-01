import { useObservable, useValue } from "@legendapp/state/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { createJSONManager } from "@/utils/JSONManager";
import { colors } from "./colors";

// Define theme types
type ThemeType = "dark";
type ThemeContextType = {
    currentTheme: ThemeType;
    setTheme: () => void;
    resetTheme: () => void;
};

interface ThemeSettings {
    currentTheme: ThemeType;
    customColors: {
        dark: typeof colors.dark;
    };
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// Create a global observable for theme state
export const themeState$ = createJSONManager<ThemeSettings>({
    filename: "theme",
    initialValue: {
        currentTheme: "dark" as ThemeType,
        customColors: clone(colors),
    },
    saveDefaultToFile: true,
});

// Create context for theme
const ThemeContext = createContext<ThemeContextType>(undefined as any);

// Theme provider component
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const currentTheme = useValue(themeState$.currentTheme);
    useValue(themeState$.customColors);

    if (currentTheme !== "dark") {
        themeState$.currentTheme.set("dark");
    }

    const setTheme = () => {
        // themeState$.currentTheme.set("dark");
    };

    const resetTheme = () => {
        // themeState$.customColors.set(clone(colors));
    };

    // Context value
    const contextValue: ThemeContextType = useMemo(
        () => ({
            currentTheme: "dark",
            setTheme,
            resetTheme,
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

// Hook to use theme
export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});
