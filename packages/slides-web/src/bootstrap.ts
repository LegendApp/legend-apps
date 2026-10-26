declare const __SLIDES_SKIA__: boolean;
declare const __SLIDES_CANVASKIT_URL__: string | undefined;
declare const __SLIDES_FONT__: string;

void (async () => {
  try {
    if (__SLIDES_SKIA__) {
      const { LoadSkiaWeb } = await import("@shopify/react-native-skia/lib/module/web");
      if (__SLIDES_CANVASKIT_URL__) {
        await LoadSkiaWeb({ locateFile: () => __SLIDES_CANVASKIT_URL__! });
      } else {
        // A classic script can load from file://; fetch and ES modules cannot.
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = new URL("./canvaskit.js", document.baseURI).href;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Could not load local CanvasKit data"));
          document.head.append(script);
        });
        const resources = globalThis as typeof globalThis & { __legendSlidesWasmURL?: string };
        const url = resources.__legendSlidesWasmURL!;
        await LoadSkiaWeb({ locateFile: () => url });
        delete resources.__legendSlidesWasmURL;
      }
      await import("react-native-reanimated");
      const { initializeFonts } = await import("./skia");
      await initializeFonts(__SLIDES_FONT__);
    }
    await import("./player");
  } catch (error) {
    document.getElementById("root")!.textContent = `Could not load presentation: ${String(error)}`;
    throw error;
  }
})();
