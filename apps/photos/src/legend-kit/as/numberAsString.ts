/**
 * Legend Kit - A collection of utilities for Legend State, Legend List, and Legend Motion
 * https://legendapp.com/kit/
 *
 * Open source package from the Legend Kit ecosystem
 * See LICENSE file in https://github.com/LegendApp/legend-kit for more information
 */

import { type ObservableParam, linked } from '@legendapp/state';

export const numberAsString = (num$: ObservableParam<number>) =>
  linked({
    get: () => `${num$.get()}`,
    set: ({ value }) => {
      num$?.set(+value);
    },
  });

/**
Usage Examples:

numberAsString creates a linked observable that converts between number and string types.
This is useful for form inputs that require string values but need to be stored as numbers.
Note: "as" helpers need to be created with an observable or useObservable when used.

Example 1: Using with observe to react to changes

import { observable, observe } from "@legendapp/state";
import { numberAsString } from "@legendapp/kit/as/numberAsString";

const price$ = observable(19.99);
// Create a linked string version for the price
const priceStr$ = observable(numberAsString(price$));

// Re-runs when either value changes
observe(() => {
  console.log(`Price (number): ${price$.get()}`);
  console.log(`Price (string): ${priceStr$.get()}`);
});

// Updating either value will trigger the observer
priceStr$.set("29.99");
// Logs:
// Price (number): 29.99
// Price (string): 29.99

Example 2: Using in React components with forms

import { observable, useObservable } from "@legendapp/state";
import { use$ } from "@legendapp/state/react";
import { numberAsString } from "@legendapp/kit/as/numberAsString";

function PriceInput() {
  // Store price as a number in state
  const price$ = useObservable(10.99);
  // Create a linked string version for the input
  const priceStr$ = useObservable(numberAsString(price$));

  // Use the string version in the input
  const inputValue = use$(priceStr$);

  return (
    <div>
      <label>
        Price:
        <input
          type="text"
          value={inputValue}
          onChange={(e) => priceStr$.set(e.target.value)}
        />
      </label>
      <p>Price in dollars: ${use$(price$).toFixed(2)}</p>
    </div>
  );
}
*/
