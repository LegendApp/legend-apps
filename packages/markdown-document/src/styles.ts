import type { MarkdownStyle } from "react-native-enriched-markdown";
import type { MarkdownDocumentLayout } from "./types";

export const defaultMarkdownLayout: MarkdownDocumentLayout = {
  blockSpacing: {
    blockquote: {
      marginBottom: 24,
      marginTop: 24,
    },
    codeBlock: {
      marginBottom: 51.2,
      marginTop: 20,
    },
    fallback: {
      marginBottom: 19.2,
      marginTop: 19.2,
    },
    heading: {
      1: { marginBottom: 24, marginTop: 48 },
      2: { marginBottom: 19.2, marginTop: 40 },
      3: { marginBottom: 16, marginTop: 32 },
      4: { marginBottom: 12.8, marginTop: 28 },
      5: { marginBottom: 9.6, marginTop: 24 },
      6: { marginBottom: 9.6, marginTop: 24 },
    },
    list: {
      marginBottom: 19.2,
      marginTop: 19.2,
    },
    paragraph: {
      marginBottom: 19.2,
      marginTop: 19.2,
    },
    table: {
      marginBottom: 24,
      marginTop: 24,
    },
    thematicBreak: {
      marginBottom: 48,
      marginTop: 48,
    },
  },
};

export const defaultMarkdownStyle: MarkdownStyle = {
  blockquote: {
    backgroundColor: "#f8fafc",
    borderColor: "#94a3b8",
    borderWidth: 3,
    color: "#334155",
    fontSize: 15,
    lineHeight: 23,
  },
  code: {
    backgroundColor: "#e5e7eb",
    color: "#111827",
    fontFamily: "Menlo",
    fontSize: 14,
  },
  codeBlock: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
    borderRadius: 6,
    borderWidth: 1,
    color: "#f9fafb",
    fontFamily: "Menlo",
    fontSize: 13,
    lineHeight: 21.45,
    padding: 20,
  },
  h1: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 38,
    marginBottom: 8,
  },
  h2: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    marginBottom: 6,
  },
  h3: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 4,
  },
  h4: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: 4,
  },
  h5: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    marginBottom: 4,
  },
  h6: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 4,
  },
  link: {
    color: "#2563eb",
    underline: true,
  },
  list: {
    color: "#374151",
    fontSize: 16,
    gapWidth: 8,
    lineHeight: 25,
    markerColor: "#6b7280",
  },
  paragraph: {
    color: "#374151",
    fontSize: 16,
    lineHeight: 25,
  },
  table: {
    borderColor: "#d1d5db",
    borderRadius: 6,
    borderWidth: 1,
    cellPaddingHorizontal: 8,
    cellPaddingVertical: 6,
    color: "#374151",
    fontSize: 14,
    headerBackgroundColor: "#f3f4f6",
    headerTextColor: "#111827",
    rowEvenBackgroundColor: "#ffffff",
    rowOddBackgroundColor: "#f9fafb",
  },
  taskList: {
    borderColor: "#6b7280",
    checkedColor: "#2563eb",
    checkedTextColor: "#6b7280",
  },
};
