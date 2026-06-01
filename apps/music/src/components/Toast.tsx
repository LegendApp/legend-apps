import { observable } from "@legendapp/state";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import { useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { cn } from "@/utils/cn";

type ToastType = "info" | "error";

export type ToastAction = {
    label: string;
    onPress: () => void;
};

type ToastState = {
    message: string;
    type: ToastType;
    action: ToastAction | null;
    visible: boolean;
    id: number;
};

const toast$ = observable<ToastState>({
    message: "",
    type: "info",
    action: null,
    visible: false,
    id: 0,
});

export function showToast(message: string, type: ToastType = "info", action?: ToastAction) {
    if (!message) {
        return;
    }
    const nextId = Date.now();
    toast$.set({
        message,
        type,
        action: action ?? null,
        visible: true,
        id: nextId,
    });
}

export function ToastProvider() {
    const toast = useValue(toast$);
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(8)).current;
    const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useObserveEffect(() => {
        const { visible, action } = toast$.get();
        if (visible) {
            if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
            }

            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 160,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 160,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]).start();

            hideTimeout.current = setTimeout(
                () => {
                    toast$.visible.set(false);
                },
                action ? 5000 : 3000,
            );

            return () => {
                if (hideTimeout.current) {
                    clearTimeout(hideTimeout.current);
                    hideTimeout.current = null;
                }
            };
        }

        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: 140,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 8,
                duration: 140,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    });

    if (!toast.visible) {
        return null;
    }

    const containerClass = cn(
        "px-3 py-2 rounded-lg border shadow-lg max-w-xl",
        toast.type === "error" ? "bg-red-500/80 border-red-400/70" : "bg-emerald-500/70 border-emerald-400/60",
    );

    return (
        <View pointerEvents="box-none" className="absolute bottom-4 left-0 right-0 items-center z-50">
            <Animated.View
                style={{
                    opacity,
                    transform: [{ translateY }],
                }}
                className={containerClass}
                pointerEvents="auto"
            >
                <View className="flex-row items-center gap-3">
                    <Text
                        className={cn(
                            "text-xs font-medium flex-shrink",
                            toast.type === "error" ? "text-red-50" : "text-emerald-50",
                        )}
                        numberOfLines={2}
                    >
                        {toast.message}
                    </Text>
                    {toast.action ? (
                        <Button
                            size="small"
                            className="rounded-md bg-white/15 hover:bg-white/25"
                            accessibilityLabel={toast.action.label}
                            onClick={() => {
                                if (hideTimeout.current) {
                                    clearTimeout(hideTimeout.current);
                                    hideTimeout.current = null;
                                }
                                toast$.visible.set(false);
                                toast.action?.onPress();
                            }}
                        >
                            <Text className="text-white text-xs font-semibold">{toast.action.label}</Text>
                        </Button>
                    ) : null}
                </View>
            </Animated.View>
        </View>
    );
}
