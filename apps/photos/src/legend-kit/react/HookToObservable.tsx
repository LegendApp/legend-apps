/**
 * Legend Kit - A collection of utilities for Legend State, Legend List, and Legend Motion
 * https://legendapp.com/kit/
 *
 * Open source package from the Legend Kit ecosystem
 * See LICENSE file in https://github.com/LegendApp/legend-kit for more information
 */

import type { Observable } from '@legendapp/state';
import { type ComponentProps, memo, useLayoutEffect } from 'react';

export type TypedMemo = <T extends React.ComponentType<any>>(
  Component: T,
  propsAreEqual?: (
    prevProps: Readonly<ComponentProps<T>>,
    nextProps: Readonly<ComponentProps<T>>
  ) => boolean
) => T & { displayName?: string };

export const typedMemo = memo as TypedMemo;

interface HookToObservableProps<T, T2> {
  value$: Observable<T>;
  hook: () => T;
  if?: (value: T) => boolean;
  getValue?: (value: T) => T2;
}
export const HookToObservable = typedMemo(function HookToObservable<T, T2 = T>({
  value$,
  hook,
  if: ifProp,
  getValue,
}: HookToObservableProps<T, T2>) {
  const value = hook();

  useLayoutEffect(() => {
    if (!ifProp || ifProp(value)) {
      try {
        const valueToSet = getValue ? getValue(value) : value;
        (value$ as Observable<any>).set(valueToSet);
      } catch {}
    }
  }, [value, ifProp, value$, getValue]);

  // This component doesn't render anything
  return null;
});

/**
 * HookToObservable connects React hooks to Observable state.
 *
 * This component takes the value from a React hook and sets it to an Observable.
 * It's useful for:
 * - Connecting React's built-in hooks (useWindowDimensions, useColorScheme, etc.) to Observable state
 * - Improving performance by not re-rendering whenever the hook updates
 * - Making hook values accessible to non-React code via Observables
 * - Conditionally updating Observable state based on hook values
 *
 * Example: Syncing window dimensions to Observable state
 *
 * ```tsx
 * import { memo } from 'react';
 * import { observable } from '@legendapp/state';
 * import { HookToObservable } from '@legendapp/state/react';
 * import { useWindowDimensions } from 'react-native';
 *
 * // Create an Observable to store window dimensions
 * const windowDimensions$ = observable({ width: 0, height: 0 });
 *
 * export const HookWindowDimensions = memo(function HookWindowDimensions() {
 *   return (
 *     <HookToObservable
 *       hook={useWindowDimensions}
 *       value$={windowDimensions$}
 *       if={() => !state$.showSettings.get()}
 *       getValue={(value) => ({ width: value.width, height: value.height })}
 *     />
 *   );
 * });
 * ```
 */
