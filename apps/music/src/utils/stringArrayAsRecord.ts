import { linked, type ObservableParam } from "@legendapp/state";

function stringArrayAsRecord<T extends string>(arr$: ObservableParam<T[]>) {
    return linked<Record<string, boolean>>({
        get: () => {
            const record: Record<string, boolean> = {};
            const value = arr$.get();
            for (let i = 0; i < value.length; i++) {
                const v = value[i];
                record[v] = true;
            }
            return record;
        },
        set: ({ value }) => {
            if (value) {
                arr$.set(Object.keys(value).filter((key) => value[key]));
            } else {
                arr$.set(value);
            }
        },
    });
}

export { stringArrayAsRecord };
