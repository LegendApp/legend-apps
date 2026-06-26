import { type WindowOptions, WindowStyleMask } from "@legend-desktop/window-manager";

type WindowStyle = NonNullable<WindowOptions["windowStyle"]>;

type WindowFrame = {
  height: number;
  minHeight: number;
  minWidth: number;
  width: number;
};

type DocumentWindowStyleOptions = {
  appearance?: WindowStyle["appearance"];
  backgroundColor?: string;
  frame: WindowFrame;
  includeFrame: boolean;
  titlebarMaterial?: WindowStyle["titlebarMaterial"];
  titlebarMaterialBlendingMode?: WindowStyle["titlebarMaterialBlendingMode"];
  titlebarMaterialLeadingInset?: WindowStyle["titlebarMaterialLeadingInset"];
  titlebarMaterialState?: WindowStyle["titlebarMaterialState"];
};

type UnifiedToolbarWindowStyleOptions = DocumentWindowStyleOptions & {
  miniaturizable?: boolean;
};

export function createDocumentWindowStyle({
  appearance,
  backgroundColor,
  frame,
  includeFrame,
  titlebarMaterial,
  titlebarMaterialBlendingMode,
  titlebarMaterialLeadingInset,
  titlebarMaterialState,
}: DocumentWindowStyleOptions): WindowStyle {
  return {
    appearance,
    backgroundColor,
    ...(includeFrame ? frame : null),
    hasToolbar: false,
    mask: [
      WindowStyleMask.Titled,
      WindowStyleMask.Closable,
      WindowStyleMask.Miniaturizable,
      WindowStyleMask.Resizable,
      WindowStyleMask.FullSizeContentView,
    ],
    titlebarAppearsTransparent: true,
    titlebarSeparatorStyle: "none",
    titleVisibility: "visible",
    titlebarMaterial,
    titlebarMaterialBlendingMode,
    titlebarMaterialLeadingInset,
    titlebarMaterialState,
  };
}

export function createUnifiedToolbarWindowStyle({
  appearance,
  backgroundColor,
  frame,
  includeFrame,
  miniaturizable = false,
  titlebarMaterial,
  titlebarMaterialBlendingMode,
  titlebarMaterialLeadingInset,
  titlebarMaterialState,
}: UnifiedToolbarWindowStyleOptions): WindowStyle {
  return {
    appearance,
    backgroundColor,
    ...(includeFrame ? frame : null),
    hasToolbar: true,
    mask: [
      WindowStyleMask.Titled,
      WindowStyleMask.Closable,
      ...(miniaturizable ? [WindowStyleMask.Miniaturizable] : []),
      WindowStyleMask.Resizable,
      WindowStyleMask.FullSizeContentView,
      WindowStyleMask.UnifiedTitleAndToolbar,
    ],
    titlebarAppearsTransparent: true,
    titlebarSeparatorStyle: "none",
    titleVisibility: "visible",
    titlebarMaterial,
    titlebarMaterialBlendingMode,
    titlebarMaterialLeadingInset,
    titlebarMaterialState,
    toolbarStyle: "unified",
  };
}

export function createBorderlessOverlayWindowStyle(frame: WindowFrame): WindowStyle {
  return {
    ...frame,
    mask: [
      WindowStyleMask.Borderless,
      WindowStyleMask.NonactivatingPanel,
      WindowStyleMask.FullSizeContentView,
    ],
    titlebarAppearsTransparent: true,
  };
}
