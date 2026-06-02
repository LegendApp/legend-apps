import type { Observable } from "@legendapp/state";
import { isObservable } from "@legendapp/state";

export function arrayToObject<T extends { id: string }>(
    arr: Observable<T>[],
    field?: keyof T,
): Record<string, Observable<T>>;
export function arrayToObject<T extends { id: string }>(arr: T[], field?: keyof T): Record<string, T>;
export function arrayToObject<T extends { id: string }>(arr: any[], field: keyof T = "id"): Record<string, T> {
    return arr
        ? arr.reduce((obj, item) => {
              const id = isObservable(item[field]) ? item[field].peek() : item[field];
              obj[id] = item;
              return obj;
          }, {})
        : {};
}
