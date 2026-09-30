import type { Observable } from "@legendapp/state";
import {
    TextInputSearch as NativeTextInputSearch,
    type TextInputSearchProps as NativeTextInputSearchProps,
    type TextInputSearchRef,
} from "@legendapp/spark/ui/search";
import { View } from "react-native";
import { forwardRef, memo, useCallback } from "react";

export type TextInputSearchProps = Omit<NativeTextInputSearchProps, "value" | "defaultValue"> & { className?: string; value$?: Observable<string>; defaultValue?: string; value?: string };

export type { TextInputSearchRef };

export const TextInputSearch = memo(
    forwardRef<TextInputSearchRef, TextInputSearchProps>(function TextInputSearch(
        { className, value$, defaultValue, value, onChangeText, ...rest },
        ref,
    ) {
        const handleChangeText = useCallback(
            (text: string) => {
                value$?.set(text);
                onChangeText?.(text);
            },
            [value$, onChangeText],
        );

        return (
            <View className={className}><NativeTextInputSearch
                ref={ref}
                {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? value$?.peek() })}
                onChangeText={handleChangeText}
                style={{ minHeight: 32 }}
                {...rest}
            /></View>
        );
    }),
);
