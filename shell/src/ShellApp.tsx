import { StyleSheet, View } from "react-native";
import { App } from "@legend-desktop/app";

export default function ShellApp() {
  return (
    <View style={styles.container}>
      <App />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
});
