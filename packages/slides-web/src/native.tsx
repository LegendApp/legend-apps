import React, { forwardRef, useMemo, useRef, useLayoutEffect } from "react";
import * as Native from "react-native-web";
export * from "react-native-web";
import { useResolveClassNames } from "uniwind";
import { preloadedSource } from "./preload";
export const View = forwardRef<any, any>(function View({ className = "", style, ...props }, ref) {
  return <Native.View {...props} style={[useResolveClassNames(className), style]} ref={ref} />;
});
export const Image = forwardRef<any, any>(function Image({ className = "", style, source, onLoad, ...props }, ref) {
  const uri = source?.uri;
  const mediaUri = useMemo(() => uri ? preloadedSource(uri) : uri, [uri]);
  const imageSource = uri ? { ...source, uri: mediaUri } : source;
  // React Native reports the decoded size as nativeEvent.source; React Native Web passes the DOM load event.
  const handleLoad = onLoad && ((event: any) => {
    const image = event.nativeEvent?.target as HTMLImageElement | undefined;
    onLoad({ ...event, nativeEvent: { source: { uri, width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 } } });
  });
  return <Native.Image {...props} onLoad={handleLoad} source={imageSource} style={[useResolveClassNames(className), style]} ref={ref} />;
});
export const Text = forwardRef<any, any>(function Text({ onTextLayout, className = "", style, ...props }, forwarded) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!onTextLayout || !ref.current) return;
    const element = ref.current;
    const box = element.getBoundingClientRect();
    const scale = box.width / element.offsetWidth || 1;
    const lines = new Map<number, { text: string; x: number; y: number; width: number; height: number }>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (let i = 0; i < (node.textContent?.length ?? 0); i++) {
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        const y = Math.round((rect.y - box.y) / scale);
        const x = (rect.x - box.x) / scale;
        const line = lines.get(y) ?? { text: "", x, y, width: 0, height: rect.height / scale };
        line.text += node.textContent![i]; line.width = Math.max(line.width, x + rect.width / scale - line.x); lines.set(y, line);
      }
    }
    onTextLayout({ nativeEvent: { lines: [...lines.values()] } });
  }, [onTextLayout, props.children]);
  return <Native.Text {...props} style={[useResolveClassNames(className), style]} ref={(element: any) => { ref.current = element; if (typeof forwarded === "function") forwarded(element); else if (forwarded) forwarded.current = element; }} />;
});
