type TimeoutEntry = {
    handle: ReturnType<typeof setTimeout>;
    cb: () => unknown;
};

const timeouts: Record<string, TimeoutEntry> = {};

export function timeoutOnce(name: string, cb: () => unknown, time: number) {
    const existing = timeouts[name];
    if (existing) {
        clearTimeout(existing.handle);
    }

    const handle = setTimeout(() => {
        delete timeouts[name];
        void cb();
    }, time);

    timeouts[name] = { handle, cb };
}

export async function flushTimeoutOnce(predicate?: (name: string) => boolean): Promise<void> {
    const entries = Object.entries(timeouts).filter(([name]) => (predicate ? predicate(name) : true));
    const callbacks = entries.map(([name, entry]) => {
        clearTimeout(entry.handle);
        delete timeouts[name];
        return entry.cb();
    });

    await Promise.all(callbacks);
}
