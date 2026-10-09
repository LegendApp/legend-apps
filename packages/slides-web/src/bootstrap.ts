import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
try {
  await LoadSkiaWeb({ locateFile: file => new URL(file, import.meta.url).href });
  await import("react-native-reanimated");
  const { initializeFonts } = await import("./skia");
  await initializeFonts();
  await import("./player");
} catch (error) {
  document.getElementById("root")!.textContent = `Could not load presentation: ${String(error)}`;
  throw error;
}
