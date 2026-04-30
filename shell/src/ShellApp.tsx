import { StyleSheet, View } from "react-native";
import { App } from "@legend-desktop/app";

export default function ShellApp(props: Record<string, unknown>) {
  return (
    <View style={styles.container}>
      <App {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
});
