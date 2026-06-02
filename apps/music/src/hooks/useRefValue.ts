import { useRef } from "react";

export function useRefValue<T>(value: T) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}
