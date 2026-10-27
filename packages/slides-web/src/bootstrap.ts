declare const __SLIDES_SKIA__: boolean;
declare const __SLIDES_CANVASKIT_URL__: string | undefined;
declare const __SLIDES_FONT__: string;

void (async () => {
  try {
    if (__SLIDES_SKIA__) {
      async function decompressAsset(data: string, type: string) {
        const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Blob([await new Response(stream).arrayBuffer()], { type });
      }
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
        const resources = globalThis as typeof globalThis & { __legendSlidesWasmGzip?: string };
        const url = URL.createObjectURL(await decompressAsset(resources.__legendSlidesWasmGzip!, "application/wasm"));
        delete resources.__legendSlidesWasmGzip;
        try { await LoadSkiaWeb({ locateFile: () => url }); }
        finally { URL.revokeObjectURL(url); }
      }
      await import("react-native-reanimated");
      const { initializeFonts } = await import("./skia");
      const fontURL = URL.createObjectURL(await decompressAsset(__SLIDES_FONT__, "font/ttf"));
      try { await initializeFonts(fontURL); }
      finally { URL.revokeObjectURL(fontURL); }
    }
    await import("./player");
  } catch (error) {
    document.getElementById("root")!.textContent = `Could not load presentation: ${String(error)}`;
    throw error;
  }
})();
