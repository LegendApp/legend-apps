import { isArray } from '@legendapp/state';

type OmitFalsy<T> = T extends undefined
  ? never
  : T extends false
    ? never
    : T extends ''
      ? never
      : T extends null
        ? never
        : T;

export function ax<T>(arr: (T | boolean | '')[]): OmitFalsy<T>[];
export function ax<T>(...arr: (T | boolean | '')[]): OmitFalsy<T>[];
export function ax<T>(...params: (T | boolean | '')[]): OmitFalsy<T>[] {
  const arr = params.length === 1 && isArray(params[0]) ? params[0] : params;
  return arr.filter(Boolean) as OmitFalsy<T>[];
}
