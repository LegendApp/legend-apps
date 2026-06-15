import type { LegendDisplayThemeFile, MarkdownLayoutThemeFile } from "./types";

export const generatedDisplayThemeFiles = [
  {
    "name": "light",
    "appearance": "light",
    "colors": {
      "background": "#f5f6f8",
      "foreground": "#111827",
      "muted": "#6b7280",
      "surface": "#ffffff",
      "surfaceMuted": "#f3f4f6",
      "border": "#d1d5db",
      "primary": "#2563eb",
      "danger": "#b42318",
      "selection": "auto",
      "code": "#111827",
      "codeForeground": "#f9fafb",
      "blockquoteBackground": "#f8fafc",
      "blockquoteBorder": "#94a3b8",
      "tableHeader": "#f3f4f6",
      "tableRowAlt": "#f9fafb",
      "windowBackground": "#f5f6f8"
    }
  },
  {
    "name": "dark",
    "appearance": "dark",
    "colors": {
      "background": "#191A1B",
      "foreground": "#f5f5f5",
      "muted": "#a3a3a3",
      "surface": "#242526",
      "surfaceMuted": "#2d2e30",
      "border": "#3e4042",
      "primary": "#60a5fa",
      "danger": "#f87171",
      "selection": "auto",
      "code": "#111213",
      "codeForeground": "#f5f5f5",
      "blockquoteBackground": "#202122",
      "blockquoteBorder": "#6f7377",
      "tableHeader": "#2a2b2d",
      "tableRowAlt": "#1f2021",
      "windowBackground": "#191A1B"
    }
  },
  {
    "name": "grey",
    "appearance": "dark",
    "colors": {
      "background": "#191919",
      "foreground": "#d4d4d4",
      "muted": "#9c9c9c",
      "surface": "#202020",
      "surfaceMuted": "#2d2d2d",
      "border": "#3d3d3d",
      "primary": "#9ca6a8",
      "link": "#7fb3ff",
      "danger": "#ff7b72",
      "selection": "auto",
      "code": "#202020",
      "codeForeground": "#e6edf3",
      "inlineCodeBackground": "#2d2d2d",
      "inlineCodeForeground": "#eb5757",
      "blockquoteBackground": "#202020",
      "blockquoteBorder": "#9ca6a8",
      "tableHeader": "#303030",
      "tableRowAlt": "#1e1e1e",
      "windowBackground": "#191919"
    }
  }
] satisfies LegendDisplayThemeFile[];

export const generatedMarkdownLayoutThemeFiles = [
  {
    "name": "default",
    "content": {
      "horizontalPadding": 40,
      "maxWidth": 820,
      "verticalPadding": 48
    },
    "typography": {
      "blockquoteFontSizeOffset": -1,
      "bodyFontSize": 16,
      "codeFontFamily": "Menlo",
      "codeFontSizeOffset": -2,
      "headingLineHeightScale": 1.45,
      "headingScale": {
        "1": 1.875,
        "2": 1.5,
        "3": 1.25,
        "4": 1.125,
        "5": 1,
        "6": 0.9375
      },
      "headingWeight": "700",
      "lineHeightScale": 1.58,
      "tableFontSizeOffset": -2
    },
    "spacing": {
      "blockquote": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "codeBlock": {
        "marginBottom": 51.2,
        "marginTop": 20
      },
      "fallback": {
        "marginBottom": 19.2,
        "marginTop": 19.2
      },
      "heading": {
        "1": {
          "marginBottom": 24,
          "marginTop": 48
        },
        "2": {
          "marginBottom": 19.2,
          "marginTop": 40
        },
        "3": {
          "marginBottom": 16,
          "marginTop": 32
        },
        "4": {
          "marginBottom": 12.8,
          "marginTop": 28
        },
        "5": {
          "marginBottom": 9.6,
          "marginTop": 24
        },
        "6": {
          "marginBottom": 9.6,
          "marginTop": 24
        }
      },
      "list": {
        "marginBottom": 19.2,
        "marginTop": 19.2
      },
      "paragraph": {
        "marginBottom": 19.2,
        "marginTop": 19.2
      },
      "table": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "thematicBreak": {
        "marginBottom": 48,
        "marginTop": 48
      }
    },
    "blocks": {
      "blockquoteBorderWidth": 3,
      "codeBlockBorderRadius": 6,
      "codeBlockBorderWidth": 1,
      "codeBlockPadding": 20,
      "listGapWidth": 8,
      "tableBorderRadius": 6,
      "tableBorderWidth": 1,
      "tableCellPaddingHorizontal": 8,
      "tableCellPaddingVertical": 6
    }
  },
  {
    "name": "compact",
    "content": {
      "horizontalPadding": 28,
      "maxWidth": 760,
      "verticalPadding": 32
    },
    "typography": {
      "blockquoteFontSizeOffset": -1,
      "bodyFontSize": 15,
      "codeFontFamily": "Menlo",
      "codeFontSizeOffset": -2,
      "headingLineHeightScale": 1.36,
      "headingScale": {
        "1": 1.65,
        "2": 1.38,
        "3": 1.18,
        "4": 1.08,
        "5": 1,
        "6": 0.92
      },
      "headingWeight": "700",
      "lineHeightScale": 1.45,
      "tableFontSizeOffset": -2
    },
    "spacing": {
      "blockquote": {
        "marginBottom": 18,
        "marginTop": 18
      },
      "codeBlock": {
        "marginBottom": 32,
        "marginTop": 16
      },
      "fallback": {
        "marginBottom": 14,
        "marginTop": 14
      },
      "heading": {
        "1": {
          "marginBottom": 16,
          "marginTop": 34
        },
        "2": {
          "marginBottom": 14,
          "marginTop": 28
        },
        "3": {
          "marginBottom": 12,
          "marginTop": 24
        },
        "4": {
          "marginBottom": 10,
          "marginTop": 20
        },
        "5": {
          "marginBottom": 8,
          "marginTop": 18
        },
        "6": {
          "marginBottom": 8,
          "marginTop": 18
        }
      },
      "list": {
        "marginBottom": 14,
        "marginTop": 14
      },
      "paragraph": {
        "marginBottom": 14,
        "marginTop": 14
      },
      "table": {
        "marginBottom": 18,
        "marginTop": 18
      },
      "thematicBreak": {
        "marginBottom": 32,
        "marginTop": 32
      }
    },
    "blocks": {
      "blockquoteBorderWidth": 3,
      "codeBlockBorderRadius": 5,
      "codeBlockBorderWidth": 1,
      "codeBlockPadding": 14,
      "listGapWidth": 7,
      "tableBorderRadius": 5,
      "tableBorderWidth": 1,
      "tableCellPaddingHorizontal": 6,
      "tableCellPaddingVertical": 4
    }
  },
  {
    "name": "reader",
    "content": {
      "horizontalPadding": 56,
      "maxWidth": 760,
      "verticalPadding": 64
    },
    "typography": {
      "blockquoteFontSizeOffset": 0,
      "bodyFontFamily": "Georgia",
      "bodyFontSize": 17,
      "codeFontFamily": "Menlo",
      "codeFontSizeOffset": -3,
      "headingLineHeightScale": 1.35,
      "headingScale": {
        "1": 2,
        "2": 1.58,
        "3": 1.32,
        "4": 1.16,
        "5": 1,
        "6": 0.94
      },
      "headingWeight": "700",
      "lineHeightScale": 1.72,
      "tableFontSizeOffset": -2
    },
    "spacing": {
      "blockquote": {
        "marginBottom": 30,
        "marginTop": 30
      },
      "codeBlock": {
        "marginBottom": 56,
        "marginTop": 24
      },
      "fallback": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "heading": {
        "1": {
          "marginBottom": 28,
          "marginTop": 60
        },
        "2": {
          "marginBottom": 22,
          "marginTop": 48
        },
        "3": {
          "marginBottom": 18,
          "marginTop": 38
        },
        "4": {
          "marginBottom": 14,
          "marginTop": 32
        },
        "5": {
          "marginBottom": 12,
          "marginTop": 28
        },
        "6": {
          "marginBottom": 12,
          "marginTop": 28
        }
      },
      "list": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "paragraph": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "table": {
        "marginBottom": 30,
        "marginTop": 30
      },
      "thematicBreak": {
        "marginBottom": 60,
        "marginTop": 60
      }
    },
    "blocks": {
      "blockquoteBorderWidth": 3,
      "codeBlockBorderRadius": 7,
      "codeBlockBorderWidth": 1,
      "codeBlockPadding": 22,
      "listGapWidth": 9,
      "tableBorderRadius": 6,
      "tableBorderWidth": 1,
      "tableCellPaddingHorizontal": 9,
      "tableCellPaddingVertical": 7
    }
  },
  {
    "name": "technical",
    "content": {
      "horizontalPadding": 40,
      "maxWidth": 980,
      "verticalPadding": 40
    },
    "typography": {
      "blockquoteFontSizeOffset": -1,
      "bodyFontSize": 15,
      "codeFontFamily": "Menlo",
      "codeFontSizeOffset": -1,
      "headingLineHeightScale": 1.38,
      "headingScale": {
        "1": 1.7,
        "2": 1.42,
        "3": 1.22,
        "4": 1.1,
        "5": 1,
        "6": 0.94
      },
      "headingWeight": "700",
      "lineHeightScale": 1.5,
      "tableFontSizeOffset": -1
    },
    "spacing": {
      "blockquote": {
        "marginBottom": 20,
        "marginTop": 20
      },
      "codeBlock": {
        "marginBottom": 36,
        "marginTop": 18
      },
      "fallback": {
        "marginBottom": 16,
        "marginTop": 16
      },
      "heading": {
        "1": {
          "marginBottom": 18,
          "marginTop": 38
        },
        "2": {
          "marginBottom": 16,
          "marginTop": 32
        },
        "3": {
          "marginBottom": 14,
          "marginTop": 26
        },
        "4": {
          "marginBottom": 12,
          "marginTop": 22
        },
        "5": {
          "marginBottom": 10,
          "marginTop": 20
        },
        "6": {
          "marginBottom": 10,
          "marginTop": 20
        }
      },
      "list": {
        "marginBottom": 16,
        "marginTop": 16
      },
      "paragraph": {
        "marginBottom": 16,
        "marginTop": 16
      },
      "table": {
        "marginBottom": 20,
        "marginTop": 20
      },
      "thematicBreak": {
        "marginBottom": 38,
        "marginTop": 38
      }
    },
    "blocks": {
      "blockquoteBorderWidth": 2,
      "codeBlockBorderRadius": 4,
      "codeBlockBorderWidth": 1,
      "codeBlockPadding": 16,
      "listGapWidth": 7,
      "tableBorderRadius": 4,
      "tableBorderWidth": 1,
      "tableCellPaddingHorizontal": 7,
      "tableCellPaddingVertical": 5
    }
  },
  {
    "name": "wide",
    "content": {
      "horizontalPadding": 56,
      "maxWidth": 1080,
      "verticalPadding": 48
    },
    "typography": {
      "blockquoteFontSizeOffset": -1,
      "bodyFontSize": 16,
      "codeFontFamily": "Menlo",
      "codeFontSizeOffset": -2,
      "headingLineHeightScale": 1.42,
      "headingScale": {
        "1": 1.82,
        "2": 1.48,
        "3": 1.24,
        "4": 1.12,
        "5": 1,
        "6": 0.94
      },
      "headingWeight": "700",
      "lineHeightScale": 1.56,
      "tableFontSizeOffset": -2
    },
    "spacing": {
      "blockquote": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "codeBlock": {
        "marginBottom": 48,
        "marginTop": 20
      },
      "fallback": {
        "marginBottom": 18,
        "marginTop": 18
      },
      "heading": {
        "1": {
          "marginBottom": 22,
          "marginTop": 46
        },
        "2": {
          "marginBottom": 18,
          "marginTop": 38
        },
        "3": {
          "marginBottom": 16,
          "marginTop": 30
        },
        "4": {
          "marginBottom": 12,
          "marginTop": 26
        },
        "5": {
          "marginBottom": 10,
          "marginTop": 22
        },
        "6": {
          "marginBottom": 10,
          "marginTop": 22
        }
      },
      "list": {
        "marginBottom": 18,
        "marginTop": 18
      },
      "paragraph": {
        "marginBottom": 18,
        "marginTop": 18
      },
      "table": {
        "marginBottom": 24,
        "marginTop": 24
      },
      "thematicBreak": {
        "marginBottom": 48,
        "marginTop": 48
      }
    },
    "blocks": {
      "blockquoteBorderWidth": 3,
      "codeBlockBorderRadius": 6,
      "codeBlockBorderWidth": 1,
      "codeBlockPadding": 20,
      "listGapWidth": 8,
      "tableBorderRadius": 6,
      "tableBorderWidth": 1,
      "tableCellPaddingHorizontal": 8,
      "tableCellPaddingVertical": 6
    }
  }
] satisfies MarkdownLayoutThemeFile[];

export const generatedThemeFiles = generatedDisplayThemeFiles;
