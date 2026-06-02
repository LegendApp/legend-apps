import { Linking, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { SettingsPage, SettingsSection } from "@/settings/components";

interface Library {
    name: string;
    description: string;
    url: string;
}

const libraries: Library[] = [
    {
        name: "React",
        description: "UI library powering components and hooks",
        url: "https://github.com/facebook/react",
    },
    {
        name: "React Native",
        description: "Core cross-platform runtime",
        url: "https://github.com/facebook/react-native",
    },
    {
        name: "React Native macOS",
        description: "Native macOS app development framework",
        url: "https://github.com/microsoft/react-native-macos",
    },
    {
        name: "Legend State",
        description: "Fast and powerful state management",
        url: "https://github.com/LegendApp/legend-state",
    },
    {
        name: "Legend List",
        description: "High-performance virtualized list component",
        url: "https://github.com/LegendApp/legend-list",
    },
    {
        name: "Legend Motion",
        description: "Animation primitives that stay in sync with Legend State",
        url: "https://github.com/LegendApp/legend-motion",
    },
    {
        name: "Expo",
        description: "Platform for universal React applications",
        url: "https://github.com/expo/expo",
    },
    {
        name: "Uniwind",
        description: "Tailwind CSS for React Native",
        url: "https://github.com/uniwind/uniwind",
    },
    {
        name: "Tailwind CSS",
        description: "Utility-first CSS framework",
        url: "https://github.com/tailwindlabs/tailwindcss",
    },
    {
        name: "Gorhom Portal",
        description: "React Native portal implementation",
        url: "https://github.com/gorhom/react-native-portal",
    },
    {
        name: "Biome",
        description: "Fast formatter and linter for web projects",
        url: "https://github.com/biomejs/biome",
    },
];

export function OpenSourceSettings() {
    const handleOpenLink = (url: string) => {
        Linking.openURL(url);
    };

    const handleOpenLegendMusicSource = () => {
        Linking.openURL("https://github.com/LegendApp/legend-music");
    };

    return (
        <SettingsPage>
            <SettingsSection
                title="Legend Music is Open Source"
                description="Legend Music is completely free and open source. Contribute to development, explore the code, or build your own version."
                first
            >
                <Button
                    onClick={handleOpenLegendMusicSource}
                    className="self-start rounded-lg bg-accent-primary px-6 py-3 hover:bg-accent-secondary"
                >
                    <Text className="text-background-inverse font-semibold">View Source Code</Text>
                </Button>
            </SettingsSection>

            <SettingsSection
                title="Legend Kit"
                description="A comprehensive suite of Legend tools with premium apps built on Legend State, List, and Motion."
                contentClassName="flex flex-col gap-3"
            >
                <Button
                    onClick={() => handleOpenLink("https://legendapp.com/kit")}
                    className="self-start rounded-lg bg-accent-primary/80 px-4 py-2 hover:bg-accent-primary"
                >
                    <Text className="text-background-inverse font-medium text-sm">Learn More</Text>
                </Button>
            </SettingsSection>

            <SettingsSection
                title="Open Source Libraries"
                description="Legend Music is built on top of these fantastic open source projects:"
                // contentClassName="flex flex-col gap-3"
            >
                {libraries.map((library) => (
                    <View
                        key={library.name}
                        className="flex-row items-center justify-between rounded-lg border border-border-primary bg-background-tertiary px-5 py-4"
                    >
                        <View className="flex-1 pr-6">
                            <Text className="text-text-primary text-base font-semibold">{library.name}</Text>
                            <Text className="mt-1 text-sm leading-relaxed text-text-secondary">
                                {library.description}
                            </Text>
                        </View>
                        <Button
                            onClick={() => handleOpenLink(library.url)}
                            className="rounded-lg border border-border-primary bg-background-secondary px-4 py-2 hover:bg-background-tertiary"
                        >
                            <Text className="text-text-primary text-sm font-medium">GitHub</Text>
                        </Button>
                    </View>
                ))}
            </SettingsSection>
        </SettingsPage>
    );
}
