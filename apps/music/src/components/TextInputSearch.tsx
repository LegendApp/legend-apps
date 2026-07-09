import type { Observable } from "@legendapp/state";
import {
    TextInputSearch as NativeTextInputSearch,
    type TextInputSearchProps as NativeTextInputSearchProps,
    type TextInputSearchRef,
} from "@legend-apps/text-input-search";
import { forwardRef, memo, useCallback } from "react";

export interface TextInputSearchProps extends NativeTextInputSearchProps {
    value$?: Observable<string>;
}

export type { TextInputSearchRef };

export const TextInputSearch = memo(
    forwardRef<TextInputSearchRef, TextInputSearchProps>(function TextInputSearch(
        { value$, defaultValue, onChangeText, ...rest },
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
            <NativeTextInputSearch
                ref={ref}
                defaultValue={defaultValue ?? value$?.peek()}
                onChangeText={handleChangeText}
                style={{ minHeight: 32 }}
                {...rest}
            />
        );
    }),
);
