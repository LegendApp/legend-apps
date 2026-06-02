import { useValue } from "@legendapp/state/react";
import { Linking, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { SettingsCard, SettingsPage, SettingsSection } from "@/settings/components";
import { settings$ } from "@/systems/Settings";

export function AccountSettings() {
    const isRegistered = useValue(settings$.registration.isRegistered);
    const registrationType = useValue(settings$.registration.registrationType);

    const handleRegister = () => {
        // TODO: Implement registration flow
        console.log("Register button clicked");
    };

    const handleGetLegendKit = () => {
        Linking.openURL("https://legendapp.com/kit");
    };

    const handleContactSupport = () => {
        // TODO: Add support contact
        console.log("Contact support clicked");
    };

    if (isRegistered) {
        return (
            <SettingsPage>
                <SettingsCard className="flex flex-col gap-6 border-green-400/30 bg-green-500/20">
                    <Text className="text-2xl font-semibold text-white">✅ Registered</Text>
                    <Text className="text-white/90 text-lg leading-relaxed">
                        Thank you for supporting Legend Music! Your registration helps us continue developing amazing
                        music tools and maintaining this open source project.
                    </Text>
                    {registrationType === "legendkit" ? (
                        <Text className="text-white/80 text-base">You have access to Legend Kit premium features.</Text>
                    ) : null}
                    {registrationType === "standalone" ? (
                        <Text className="text-white/80 text-base">
                            You have a standalone Legend Music registration.
                        </Text>
                    ) : null}
                </SettingsCard>

                <SettingsCard className="flex flex-col gap-4">
                    <Text className="text-white font-semibold text-lg">Need Help?</Text>
                    <Text className="text-white/80 text-base leading-relaxed">
                        If you have any questions or need support, we're here to help.
                    </Text>
                    <Button
                        onClick={handleContactSupport}
                        className="self-start rounded-lg bg-accent-primary px-6 py-3 hover:bg-accent-secondary"
                    >
                        <Text className="text-background-inverse font-semibold">Contact Support</Text>
                    </Button>
                </SettingsCard>
            </SettingsPage>
        );
    }

    return (
        <SettingsPage>
            <SettingsSection
                title="Legend Music is Free & Open Source"
                description="Legend Music is completely free to use and open source. Your support helps us dedicate more time to improving the app and other Legend tools."
            />

            <SettingsSection title="Support Options">
                <View className="flex flex-col gap-4 rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-500/15 to-purple-500/15 px-6 py-6">
                    <Text className="text-2xl font-semibold text-white">🚀 Legend Kit (Recommended)</Text>
                    <Text className="text-white/90 text-lg leading-relaxed">
                        Get Legend Kit for the best experience! It includes premium versions of Legend Music and other
                        Legend apps, plus advanced development tools.
                    </Text>
                    <Button
                        onClick={handleGetLegendKit}
                        className="self-start rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-3 hover:from-blue-600 hover:to-purple-600"
                    >
                        <Text className="text-white font-bold text-lg">Get Legend Kit</Text>
                    </Button>
                </View>

                <View className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 px-6 py-6">
                    <Text className="text-xl font-semibold text-white">💝 Standalone Registration - $9</Text>
                    <Text className="text-white/80 text-base leading-relaxed">
                        Support Legend Music directly with a one-time $9 registration. This helps fund continued
                        development while keeping the app free and open source for everyone.
                    </Text>
                    <Button
                        onClick={handleRegister}
                        className="self-start rounded-xl border border-white/20 bg-white/10 px-6 py-3 hover:bg-white/20"
                    >
                        <Text className="text-white font-semibold text-lg">Register for $9</Text>
                    </Button>
                </View>
            </SettingsSection>

            <SettingsSection title="Why Register?">
                <Text className="text-text-secondary text-base leading-relaxed">
                    💡 <Text className="font-semibold text-text-primary">Why register?</Text> Your support allows us to
                    spend more time improving Legend Music, fixing bugs, adding features, and creating new Legend apps.
                    Even if you choose not to register, you'll always have access to the full app.
                </Text>
            </SettingsSection>
        </SettingsPage>
    );
}
