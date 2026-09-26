import { Linking } from "react-native";
import { onOpen } from "../../../../packages/host-links/src";

jest.mock("react-native", () => ({
  Linking: { addEventListener: jest.fn(), getInitialURL: jest.fn() },
}));

test("subscribes before awaiting the launch URL and retains live opens", async () => {
  const remove = jest.fn();
  let resolveInitial!: (url: string | null) => void;
  jest.mocked(Linking.addEventListener).mockReturnValue({ remove } as unknown as ReturnType<typeof Linking.addEventListener>);
  jest.mocked(Linking.getInitialURL).mockReturnValue(new Promise(resolve => { resolveInitial = resolve; }));
  const listener = jest.fn();
  const pending = onOpen(listener);
  expect(Linking.addEventListener).toHaveBeenCalledWith("url", listener);
  const liveListener = jest.mocked(Linking.addEventListener).mock.calls.at(-1)![1];
  liveListener({ url: "legend-diff://warm" });
  resolveInitial("legend-diff://cold");
  const subscription = await pending;
  expect(listener.mock.calls).toEqual([[{ url: "legend-diff://warm" }], [{ url: "legend-diff://cold" }]]);
  subscription.remove();
  expect(remove).toHaveBeenCalledTimes(1);
});

test("removes the live listener if reading the launch URL fails", async () => {
  const remove = jest.fn();
  jest.mocked(Linking.addEventListener).mockReturnValue({ remove } as unknown as ReturnType<typeof Linking.addEventListener>);
  jest.mocked(Linking.getInitialURL).mockRejectedValue(new Error("launch failure"));
  await expect(onOpen(jest.fn())).rejects.toThrow("launch failure");
  expect(remove).toHaveBeenCalledTimes(1);
});
