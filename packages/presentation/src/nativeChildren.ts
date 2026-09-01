import { Children, type ReactNode } from "react";

export function renderNativeChildren(children: ReactNode, renderText: (text: string) => ReactNode) {
  return Children.map(children, (child) => {
    if (typeof child !== "string" && typeof child !== "number") {
      return child;
    }

    const text = String(child);
    return text.trim() ? renderText(text) : null;
  });
}
