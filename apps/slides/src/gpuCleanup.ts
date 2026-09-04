// A user cleanup must not prevent the host device from being released, even
// when it throws synchronously or returns a rejected promise.
export function releaseGPUResources(
  disposeScene: (() => void | Promise<void>) | undefined,
  destroyDevice: (() => void) | undefined,
  report: (error: unknown) => void,
) {
  try {
    Promise.resolve(disposeScene?.()).catch(report);
  } catch (error) {
    report(error);
  }
  try {
    destroyDevice?.();
  } catch (error) {
    report(error);
  }
}
