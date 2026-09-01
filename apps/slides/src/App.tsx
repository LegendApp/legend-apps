import { addApplicationReopenRequestedListener } from "@legend-apps/window-manager";
import { useEffect } from "react";
import { slidesWindows } from "./slidesWindows";

export type SlidesAppProps = { launchArguments?: string[] };

export function App({ launchArguments }: SlidesAppProps) {
  useEffect(() => {
    const openPresenter = () => slidesWindows.open("SlidesPresenterWindow", {
      initialProperties: { launchArguments },
    });
    void openPresenter();
    const subscription = addApplicationReopenRequestedListener(() => void openPresenter());
    return () => subscription.remove();
  }, [launchArguments]);
  return null;
}

export default App;
