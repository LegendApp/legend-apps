import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { state$ } from "@/systems/State";
import type { KeyboardEventCodeHotkey } from "@/systems/keyboard/Keyboard";
import { keysPressed$ } from "@/systems/keyboard/Keyboard";
import { KeyCodes, KeyText } from "@/systems/keyboard/KeyboardManager";
import { cn } from "@/utils/cn";

const MODIFIER_CODES = [
    KeyCodes.MODIFIER_COMMAND,
    KeyCodes.MODIFIER_SHIFT,
    KeyCodes.MODIFIER_OPTION,
    KeyCodes.MODIFIER_CONTROL,
    KeyCodes.MODIFIER_CAPS_LOCK,
    KeyCodes.MODIFIER_FUNCTION,
];

const MODIFIER_SET = new Set<number>(MODIFIER_CODES);

const formatKeyCodes = (codes: number[]) => {
    if (codes.length === 0) {
        return "";
    }

    const ordered = [
        ...MODIFIER_CODES.filter((code) => codes.includes(code)),
        ...codes.filter((code) => !MODIFIER_SET.has(code)),
    ];

    const labels = ordered.map((code) => KeyText[code] ?? `${code}`);
    return labels.join(" + ");
};

const parseHotkeyCodes = (value: KeyboardEventCodeHotkey | null) => {
    if (!value) {
        return [] as number[];
    }

    return `${value}`
        .split("+")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
            const numeric = Number(segment);
            if (!Number.isNaN(numeric) && `${numeric}` === segment) {
                return numeric;
            }

            const match = Object.entries(KeyText).find(([, text]) => text === segment);
            return match ? Number(match[0]) : undefined;
        })
        .filter((code): code is number => typeof code === "number");
};

const serializeHotkey = (codes: number[]): KeyboardEventCodeHotkey => {
    const ordered = [
        ...MODIFIER_CODES.filter((code) => codes.includes(code)),
        ...codes.filter((code) => !MODIFIER_SET.has(code)),
    ];
    const unique = ordered.filter((code, index) => ordered.indexOf(code) === index);
    return unique.map((code) => `${code}`).join("+") as KeyboardEventCodeHotkey;
};

const getPressedKeyCodes = () => {
    const pressed = keysPressed$.get();
    return Object.entries(pressed)
        .filter(([, value]) => value)
        .map(([key]) => Number(key))
        .filter((code) => Number.isFinite(code));
};

export interface HotkeyCaptureProps {
    value: KeyboardEventCodeHotkey | null;
    onChange: (value: KeyboardEventCodeHotkey | null) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

export function HotkeyCapture({
    value,
    onChange,
    disabled = false,
    placeholder = "Click to record",
    className,
}: HotkeyCaptureProps) {
    const [isCapturing, setIsCapturing] = useState(false);
    const [pressedDisplay, setPressedDisplay] = useState<string | null>(null);
    const lastValidCapture = useRef<number[] | null>(null);

    const handleCancel = useCallback(() => {
        lastValidCapture.current = null;
        setPressedDisplay(null);
        setIsCapturing(false);
    }, []);

    const handleCommit = useCallback(() => {
        if (!lastValidCapture.current) {
            handleCancel();
            return;
        }

        const nextValue = serializeHotkey(lastValidCapture.current);
        onChange(nextValue);
        handleCancel();
    }, [handleCancel, onChange]);

    const handleStart = useCallback(() => {
        if (disabled) {
            return;
        }

        lastValidCapture.current = null;
        setPressedDisplay(null);
        setIsCapturing(true);
    }, [disabled]);

    const handleBlur = useCallback(() => {
        if (!isCapturing) {
            return;
        }

        handleCancel();
    }, [handleCancel, isCapturing]);

    useEffect(() => {
        if (!isCapturing) {
            state$.listeningForKeyPress.set(false);
            return;
        }

        state$.listeningForKeyPress.set(true);

        const handleKeyChange = () => {
            const pressedCodes = getPressedKeyCodes();

            if (pressedCodes.includes(KeyCodes.KEY_ESCAPE)) {
                handleCancel();
                return;
            }

            if (pressedCodes.length > 0) {
                setPressedDisplay(formatKeyCodes(pressedCodes));

                const hasNonModifier = pressedCodes.some((code) => !MODIFIER_SET.has(code));
                if (hasNonModifier) {
                    lastValidCapture.current = pressedCodes;
                }
                return;
            }

            if (lastValidCapture.current) {
                handleCommit();
                return;
            }

            handleCancel();
        };

        handleKeyChange();
        const unsubscribe = keysPressed$.onChange(handleKeyChange);

        return () => {
            unsubscribe();
            state$.listeningForKeyPress.set(false);
        };
    }, [handleCancel, handleCommit, isCapturing]);

    useEffect(() => {
        if (disabled && isCapturing) {
            handleCancel();
        }
    }, [disabled, handleCancel, isCapturing]);

    const displayValue = useMemo(() => {
        if (isCapturing) {
            return pressedDisplay || "Press keys...";
        }

        const formatted = formatKeyCodes(parseHotkeyCodes(value));
        return formatted || placeholder;
    }, [isCapturing, placeholder, pressedDisplay, value]);

    return (
        <Pressable
            className={cn(
                "w-48 rounded-md border border-border-primary bg-background-secondary px-3 py-2",
                isCapturing && "border-accent-primary",
                disabled && "opacity-60",
                className,
            )}
            onPress={handleStart}
            onBlur={handleBlur}
            focusable
            accessibilityRole="button"
            disabled={disabled}
        >
            <View className="flex-row items-center">
                <Text className={cn("text-sm text-text-primary", !value && !isCapturing && "text-text-tertiary")}>
                    {displayValue}
                </Text>
            </View>
        </Pressable>
    );
}
