import { observable } from "@legendapp/state";
import type { MenuState } from "@legend-apps/runtime-utils";
export const diffActiveMenuWindow$ = observable("main");
export const diffMenuState$ = observable<Record<string, Record<string, MenuState>>>({});
export const diffMenuShortcuts$ = observable<Record<string, MenuState>>({});
