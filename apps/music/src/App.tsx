import { MusicTestView } from "@legend-desktop/music-test";
import { StyleSheet, Text, View } from "react-native";

export function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello Music</Text>
      <MusicTestView style={styles.nativeView} />
    </View>
  );
}

export default App;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  nativeView: {
    height: 48,
    width: 240,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
});
