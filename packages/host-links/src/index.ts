import { Linking } from "react-native";
export const getInitialURL = () => Linking.getInitialURL();
export const addEventListener = (type: "url", listener: (event: { url: string }) => void) => Linking.addEventListener(type, listener);
