import { Linking } from "react-native";
export const getInitialURL = () => Linking.getInitialURL();
export const addEventListener = (type: "url", listener: (event: { url: string }) => void) => Linking.addEventListener(type, listener);

// Match Spark's queued-open API on the legacy host: subscribe before reading
// the launch URL so opens received during initialization are not lost.
export async function onOpen(listener: (event: { url: string }) => void) {
  const subscription = Linking.addEventListener("url", listener);
  try {
    const url = await Linking.getInitialURL();
    if (url) listener({ url });
    return subscription;
  } catch (error) {
    subscription.remove();
    throw error;
  }
}
