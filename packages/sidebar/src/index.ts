import { createElement, type ReactNode } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import NativeSidebar, {
  type SidebarLayoutEvent,
  type SidebarSelectionChangeEvent,
} from "./SidebarNativeComponent";
import NativeSidebarItem, { type SidebarItemRightClickEvent } from "./SidebarItemNativeComponent";

export type SidebarItemData = Readonly<{
  id: string;
  selectable?: boolean;
  title: string;
}>;

export type SidebarRowHeight = number | "auto";

export interface SidebarProps extends ViewProps {
  children?: ReactNode;
  contentInsetTop?: number;
  defaultRowHeight?: number;
  items?: readonly SidebarItemData[];
  onSidebarLayout?: (event: NativeSyntheticEvent<SidebarLayoutEvent>) => void | Promise<void>;
  onSidebarSelectionChange?: (event: NativeSyntheticEvent<SidebarSelectionChangeEvent>) => void | Promise<void>;
  selectedId?: string;
}

export interface SidebarItemProps extends ViewProps {
  children?: ReactNode;
  itemId: string;
  onRightClick?: (event: NativeSyntheticEvent<SidebarItemRightClickEvent>) => void | Promise<void>;
  rowHeight?: SidebarRowHeight;
  selectable?: boolean;
}

export function Sidebar({
  children,
  contentInsetTop = 0,
  defaultRowHeight = 28,
  items,
  ...props
}: SidebarProps) {
  return createElement(
    NativeSidebar,
    {
      contentInsetTop,
      defaultRowHeight,
      itemsJson: items ? JSON.stringify(items) : "",
      ...props,
    },
    children,
  );
}

export function SidebarItem({
  children,
  rowHeight,
  selectable = true,
  ...props
}: SidebarItemProps) {
  return createElement(
    NativeSidebarItem,
    {
      autoHeight: rowHeight === "auto",
      rowHeight: typeof rowHeight === "number" ? rowHeight : 0,
      selectable,
      ...props,
    },
    children,
  );
}

export type {
  SidebarItemRightClickEvent,
  SidebarLayoutEvent,
  SidebarSelectionChangeEvent,
};
export { default as NativeSidebar } from "./SidebarNativeComponent";
export { default as NativeSidebarItem } from "./SidebarItemNativeComponent";
