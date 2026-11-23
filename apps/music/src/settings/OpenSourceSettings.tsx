import { Linking, Text } from "react-native";

import { Button } from "../components/Button";
import { SettingsRow, SettingsSection } from "./components";

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

function LinkButton({ label, url, variant = "secondary" }: { label: string; url: string; variant?: "accent" | "secondary" }) {
    return (
        <Button size="small" variant={variant} onClick={() => Linking.openURL(url)}>
            <Text className="text-sm font-medium text-text-primary">{label}</Text>
        </Button>
    );
}

export function OpenSourceSettingsContent() {
    return (
        <>
            <SettingsSection>
                <SettingsRow
                    label="Legend Music is free and open source"
                    description="Contribute to development, explore the code, or build your own version."
                >
                    <LinkButton label="View on GitHub" url="https://github.com/LegendApp/legend-music" variant="accent" />
                </SettingsRow>
                <SettingsRow
                    label="Legend Kit"
                    description="A comprehensive suite of Legend tools with premium apps built on Legend State, List, and Motion."
                >
                    <LinkButton label="Learn More" url="https://legendapp.com/kit" />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Built With">
                {libraries.map((library) => (
                    <SettingsRow key={library.name} label={library.name} description={library.description}>
                        <LinkButton label="GitHub" url={library.url} />
                    </SettingsRow>
                ))}
            </SettingsSection>
        </>
    );
}
