import type { ComponentType } from "react";

import type { WindowOptions } from "@legend-apps/window-manager";

export type WindowComponentLoader<P = Record<string, unknown>> = () =>
  | Promise<{ default: ComponentType<P> } | ComponentType<P>>
  | { default: ComponentType<P> }
  | ComponentType<P>;

export type WindowConfigEntry<P = Record<string, unknown>> = {
  component?: ComponentType<P>;
  loadComponent?: WindowComponentLoader<P>;
  identifier?: string;
  options?: Omit<WindowOptions, "identifier" | "moduleName">;
};

export type WindowsConfig = Record<string, WindowConfigEntry>;
