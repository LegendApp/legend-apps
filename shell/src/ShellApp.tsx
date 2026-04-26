import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { App } from "@legend-desktop/app";

export default function ShellApp() {
  return (
    <View style={styles.container}>
      <App />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
});
