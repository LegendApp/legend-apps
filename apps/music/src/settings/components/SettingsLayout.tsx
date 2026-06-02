import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import { cn } from "@/utils/cn";

interface SettingsPageProps {
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    actions?: ReactNode;
}

export function SettingsPage({ children, contentClassName, actions }: SettingsPageProps) {
    return (
        <View className={cn("flex-1")}>
            {actions ? <View className="flex-row justify-end px-6 pt-4">{actions}</View> : null}
            <ScrollView
                className="flex-1"
                contentContainerClassName={cn("mx-auto w-full max-w-4xl px-6 flex flex-col", contentClassName)}
            >
                {children}
            </ScrollView>
        </View>
    );
}

interface SettingsSectionProps {
    title: string;
    description?: string;
    children?: ReactNode;
    className?: string;
    contentClassName?: string;
    headerRight?: ReactNode;
    card?: boolean;
    first?: boolean;
}

export function SettingsSection({
    title,
    description,
    children,
    className,
    contentClassName,
    headerRight,
    card = true,
    first = false,
}: SettingsSectionProps) {
    const containerClassName = cn("flex flex-col gap-6", !first && "mt-6", className);
    const content = (
        <>
            <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1 flex-col gap-1.5">
                    <Text className="text-xl font-semibold text-text-primary leading-tight">{title}</Text>
                    {description ? (
                        <Text className="text-sm leading-relaxed text-text-secondary">{description}</Text>
                    ) : null}
                </View>
                {headerRight ? <View className="flex-none ml-4">{headerRight}</View> : null}
            </View>
            {children ? <View className={cn("flex flex-col gap-5", contentClassName)}>{children}</View> : null}
        </>
    );

    if (!card) {
        return <View className={containerClassName}>{content}</View>;
    }

    return <SettingsCard className={containerClassName}>{content}</SettingsCard>;
}

interface SettingsCardProps {
    children: ReactNode;
    className?: string;
}

export function SettingsCard({ children, className }: SettingsCardProps) {
    return (
        <View
            className={cn("rounded-2xl border border-border-primary bg-background-secondary p-6 shadow-xl", className)}
        >
            {children}
        </View>
    );
}

interface SettingsRowProps {
    title: string;
    description?: string;
    control: ReactNode;
    className?: string;
    contentClassName?: string;
    controlWrapperClassName?: string;
    align?: "start" | "center";
    disabled?: boolean;
}

export function SettingsRow({
    title,
    description,
    control,
    className,
    contentClassName,
    controlWrapperClassName,
    align = "start",
    disabled = false,
}: SettingsRowProps) {
    return (
        <View
            className={cn(
                "flex-row justify-between gap-6 rounded-xl border border-border-primary bg-background-tertiary px-5 py-4",
                align === "center" ? "items-center" : "items-start",
                disabled ? "opacity-60" : "",
                className,
            )}
        >
            <View className={cn("flex-1 flex-col gap-1.5 pr-6", contentClassName)}>
                <Text className="text-base font-semibold text-text-primary leading-tight">{title}</Text>
                {description ? (
                    <Text className="text-sm leading-relaxed text-text-secondary">{description}</Text>
                ) : null}
            </View>
            <View className={cn("flex-none", controlWrapperClassName)}>{control}</View>
        </View>
    );
}
