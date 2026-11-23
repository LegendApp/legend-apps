import { StyleSheet } from "react-native";
import { contentHorizontalPadding, contentMaxWidth } from "./constants";

export const markdownDocumentStyles = StyleSheet.create({
  blockRow: {
    overflow: "visible",
    paddingHorizontal: 0,
    position: "relative",
    width: "100%",
  },
  blockSelectionInput: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },
  blockSelectionOverlay: {
    bottom: 0,
    left: 0,
    opacity: 0.38,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#f5f6f8",
    flex: 1,
  },
  contentContainer: {
    alignSelf: "center",
    maxWidth: contentMaxWidth,
    paddingHorizontal: contentHorizontalPadding,
    paddingVertical: 48,
    position: "relative",
    width: "100%",
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
    padding: 32,
    textAlign: "center",
  },
  editorInput: {
    backgroundColor: "transparent",
    color: "#374151",
    fontSize: 16,
    lineHeight: 25,
    minHeight: 25,
    padding: 0,
    width: "100%",
  },
  editorInputShell: {
    backgroundColor: "transparent",
    minHeight: 25,
    padding: 0,
    width: "100%",
  },
  editorInputOverlay: {
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 2,
  },
  headingEditMarker: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "flex-end",
    left: -42,
    minWidth: 32,
    position: "absolute",
    zIndex: 2,
  },
  headingEditMarkerLevel: {
    fontWeight: "700",
    marginLeft: 1,
    transform: [{ translateY: 5 }],
  },
  headingEditMarkerText: {
    fontWeight: "800",
  },
  emptyParagraphPlaceholder: {
    width: "100%",
  },
  list: {
    flex: 1,
  },
  nativeEditorSpacer: {
    width: "100%",
  },
  overlayEditorInput: {
    left: -10000,
    minHeight: 25,
    position: "absolute",
    top: -10000,
  },
  renderedText: {
    width: "100%",
  },
  rowContent: {
    width: "100%",
  },
  // AppKit clips cursor rects and tracking areas to ancestor bounds, so the toolbar's footer spans the list.
  selectionToolbarFooter: {
    bottom: 0,
    left: 0,
    pointerEvents: "box-none",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  selectionToolbarFooterContent: {
    flex: 1,
  },
  statusText: {
    color: "#6b7280",
    fontSize: 14,
  },
});
