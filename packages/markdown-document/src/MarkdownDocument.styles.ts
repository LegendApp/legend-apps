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
    left: 0,
    position: "absolute",
    right: 0,
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
  list: {
    flex: 1,
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
  statusText: {
    color: "#6b7280",
    fontSize: 14,
  },
});
