/** Keep ownership while asynchronous native setup and teardown are pending. */
export function ownRegistration<T extends { remove(): void | Promise<void> }>(registration: T | Promise<T>, onError: (error: unknown) => void = console.error) {
  const ready = Promise.resolve(registration);
  void ready.catch(onError);
  let removal: Promise<void> | undefined;
  return {
    ready,
    remove(): Promise<void> {
      removal ??= ready.then(handle => handle.remove()).then(() => {}).catch(error => {
        removal = undefined;
        throw error;
      });
      return removal;
    },
  };
}
