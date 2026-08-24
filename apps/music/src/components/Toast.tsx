import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { Text, View } from "react-native";

import { Button } from "./Button";
import { cn } from "@legend-apps/classnames";

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

type ShowToast = (message: string, type?: ToastType, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(showToast);

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

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: PropsWithChildren) {
    const globalToast = useValue(toast$);
    const [localToast, setLocalToast] = useState<ToastState | null>(null);
    const toast = localToast ?? globalToast;
    const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showLocalToast = useCallback<ShowToast>((message, type = "info", action) => {
        if (!message) {
            return;
        }
        setLocalToast({
            message,
            type,
            action: action ?? null,
            visible: true,
            id: Date.now(),
        });
    }, []);

    const dismissToast = useCallback(() => {
        if (localToast) {
            setLocalToast(null);
        } else {
            toast$.visible.set(false);
        }
    }, [localToast]);

    useEffect(() => {
        if (!toast.visible) {
            return;
        }

        hideTimeout.current = setTimeout(
            dismissToast,
            toast.action ? 5000 : toast.type === "error" ? 8000 : 3000,
        );

        return () => {
            if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
                hideTimeout.current = null;
            }
        };
    }, [dismissToast, toast.action, toast.id, toast.type, toast.visible]);

    const containerClass = cn(
        "px-3 py-2 rounded-lg border shadow-lg max-w-xl",
        toast.type === "error" ? "bg-red-500/80 border-red-400/70" : "bg-emerald-500/70 border-emerald-400/60",
    );

    return (
        <ToastContext.Provider value={showLocalToast}>
            {children}
            {toast.visible ? (
                <View pointerEvents="box-none" className="absolute bottom-4 left-0 right-0 items-center z-50">
                    <View className={containerClass} pointerEvents="auto">
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
                                        dismissToast();
                                        toast.action?.onPress();
                                    }}
                                >
                                    <Text className="text-white text-xs font-semibold">{toast.action.label}</Text>
                                </Button>
                            ) : null}
                        </View>
                    </View>
                </View>
            ) : null}
        </ToastContext.Provider>
    );
}
