import type { Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { useLayoutEffect } from "react";

export function useObservableLatest<T>(value: T): Observable<T> {
    const obs$ = useObservable(value as any);

    useLayoutEffect(() => {
        obs$.set(value);
    }, [value, obs$]);

    return obs$ as unknown as Observable<T>;
}
