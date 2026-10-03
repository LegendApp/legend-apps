import { act, render } from "@testing-library/react-native";
import { addWindowListener, beforeWindowClose } from "@legendapp/spark/windows";
import { DiffWindowLifecycle } from "../DiffWindowLifecycle";
import { registerDiffWindowExitPreparation } from "../diffAppExit";

jest.mock("@legendapp/spark/windows", () => ({
  useWindowId: () => "viewer",
  beforeWindowClose: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
  addWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));

it("keeps one close guard while customized viewers replace their draft preparation", async () => {
  const firstClose = jest.fn();
  const secondClose = jest.fn();
  const firstPreparation = jest.fn(async () => true);
  const secondPreparation = jest.fn(async () => false);
  const unregisterFirst = registerDiffWindowExitPreparation("viewer", firstPreparation);
  const view = await render(<DiffWindowLifecycle onClose={firstClose} />);
  const close = jest.mocked(beforeWindowClose).mock.calls[0]![1];
  await expect(close()).resolves.toBe(true);
  const unregisterSecond = registerDiffWindowExitPreparation("viewer", secondPreparation);
  unregisterFirst();
  await view.rerender(<DiffWindowLifecycle onClose={secondClose} />);
  await expect(close()).resolves.toBe(false);
  expect(beforeWindowClose).toHaveBeenCalledTimes(1);
  expect(firstPreparation).toHaveBeenCalledWith("close");
  expect(secondPreparation).toHaveBeenCalledWith("close");
  await act(async () => { jest.mocked(addWindowListener).mock.calls[0]![2]({ windowId: "viewer" }); });
  expect(firstClose).not.toHaveBeenCalled();
  expect(secondClose).toHaveBeenCalledTimes(1);
  unregisterSecond();
  await view.unmount();
});
