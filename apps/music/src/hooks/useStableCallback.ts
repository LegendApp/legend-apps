import { useCallback, useLayoutEffect, useRef } from "react";

export function useStableCallback<T extends (...args: any[]) => void>(unstableCallback: T): T {
    const ref = useRef<T>(unstableCallback);
    useLayoutEffect(() => {
        ref.current = unstableCallback;
    }, [unstableCallback]);
    const callback = useCallback((...args: Parameters<T>) => ref.current?.(...args), []);
    return callback as unknown as T;
}
