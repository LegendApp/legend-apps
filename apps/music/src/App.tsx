import { StyleSheet, Text, View } from "react-native";

export function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello Music</Text>
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
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
});
