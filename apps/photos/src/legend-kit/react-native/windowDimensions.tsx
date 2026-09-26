import { HookToObservable } from '../react/HookToObservable';
import { state$ } from '../../systems/State';
import { type Observable, observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
/**
 * Legend Kit - A collection of utilities for Legend State, Legend List, and Legend Motion
 * https://legendapp.com/kit/
 *
 * Open source package from the Legend Kit ecosystem
 * See LICENSE file in https://github.com/LegendApp/legend-kit for more information
 */
import * as React from 'react';
import { memo } from 'react';
import { useWindowDimensions as useWindowDimensionsRN } from 'react-native';

// Observable to store window dimensions
export const windowDimensions$ = observable({
  width: 0,
  height: 0,
});

export interface HookWindowDimensionsProps {
  windowDimensions$: Observable<{ width: number; height: number }>;
  if?: (value: any) => boolean;
}

// Component that syncs window dimensions to an observable
export const HookWindowDimensions = memo(function HookWindowDimensions({
  if: ifProp,
  windowDimensions$: windowDimensionsProp$,
}: HookWindowDimensionsProps) {
  return (
    <HookToObservable
      hook={useWindowDimensionsRN}
      value$={windowDimensionsProp$ || windowDimensions$}
      if={ifProp}
      getValue={(value) => {
        if (state$.showSettings.get()) {
          throw new Error();
        }
        return { width: value.width, height: value.height };
      }}
    />
  );
});

export function useWindowDimensions() {
  return useValue(windowDimensions$);
}

/**
HookWindowDimensions is a React component that synchronizes window dimensions
to an observable. It uses the useWindowDimensions hook from react-native to
get the current window dimensions and updates the observable with the new values.

We suggest that you put it at the bottom of your App component. It just needs to render as a component
in order to hook the observable to the window dimensions.

Then you can access the windowDimensions$ observable from anywhere in your app.

Example:

```tsx
import { observable } from "@legendapp/state";
import { HookWindowDimensions, windowDimensions$ } from "@legendapp/state/rn";

function MyComponent() {
  const onPress = () => {
    console.log(windowDimensions$.get());
  };

  return (
    <Button onPress={onPress}>
      <Text>Click me</Text>
    </Button>
  );
}

export function App() {
  return (
    <MyComponent  />
    <HookWindowDimensions />
  );
}
```

 */
