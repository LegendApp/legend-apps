// Compile the real Music components; replace native surfaces and external commands with controlled boundaries.
module.exports = function createMusicRenderHarness() {
  const repositoryRoot = require("node:path").resolve(__dirname, "../../../..");
  const fs = require("fs"),
    path = require("path"),
    {
      createRequire
    } = require("module");
  const req = createRequire(path.join(repositoryRoot, "package.json"));
  const React = req("react"),
    {
      act,
      create
    } = req("react-test-renderer"),
    state = createRequire(path.join(repositoryRoot, "apps/music/package.json"))("@legendapp/state"),
    stateReact = createRequire(path.join(repositoryRoot, "apps/music/package.json"))("@legendapp/state/react"),
    babel = req("@babel/core");
  const noop = () => {},
    cn = (...v) => v.filter(Boolean).join(" ");
  const Wrapper = ({
    children
  }) => React.createElement(React.Fragment, null, children);
  const native = {
    View: "view",
    Text: "text",
    ScrollView: "scroll",
    TextInput: "input",
    Platform: {
      OS: "macos"
    },
    StyleSheet: {
      create: s => s
    },
    UIManager: {},
    findNodeHandle: () => null
  };
  function load(relative, mocks = {}, requireCompiler = true) {
    const filename = path.join(repositoryRoot, relative),
      r = createRequire(filename);
    const {
      code
    } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
      filename,
      babelrc: false,
      configFile: false,
      presets: [req.resolve("@react-native/babel-preset")],
      plugins: [[req.resolve("babel-plugin-react-compiler"), {
        panicThreshold: "all_errors",
        target: "19"
      }]]
    });
    if (requireCompiler && !code.includes("react/compiler-runtime")) throw Error("uncompiled " + relative);
    const mod = {
      exports: {}
    };
    new Function("require", "module", "exports", code)(n => ({
      "react": React,
      "react-native": native,
      "@legendapp/state": state,
      "@legendapp/state/react": stateReact,
      "@legend-apps/classnames": {
        cn
      },
      ...mocks
    })[n] ?? r(n), mod, mod.exports);
    return mod.exports;
  }
  const tracks = Array.from({
    length: 20
  }, (_, i) => ({
    id: String(i),
    queueEntryId: "q" + i,
    title: "Song " + i,
    artist: "Artist",
    duration: "120",
    filePath: "/music/" + i + ".mp3",
    fileName: i + ".mp3"
  }));
  const localMusicState$ = state.observable({
    tracks: tracks.slice(),
    playlists: [],
    isLocalFilesSelected: false,
    isScanning: false,
    thumbnailVersion: 0
  });
  const librarySettings$ = state.observable({
    paths: ["/music"]
  });
  const queue$ = state.observable({
    tracks: tracks.slice()
  });
  const localPlayerState$ = state.observable({
    currentTrack: null,
    currentIndex: -1,
    isPlaying: false
  });
  const settings$ = state.observable({
    general: {
      playlistStyle: "compact"
    },
    providers: {
      spotify: {
        enabled: true,
        clientId: "id"
      }
    }
  });
  const selectedIndices$ = state.observable(new Set());
  const selection = {
    selectedIndices$,
    handleTrackClick: noop,
    syncSelectionAfterReorder: noop,
    clearSelection: noop
  };
  const drag = {
    draggedItem$: state.observable(null),
    activeDropZone$: state.observable(null),
    checkDropZones: noop
  };
  const actions = [],
    menus = [],
    menuResponses = [];
  const contextMenu = {
    showContextMenu: async items => {
      menus.push(items);
      return menuResponses.shift() ?? null;
    }
  };
  const trackMenus = {
    buildTrackContextMenuItems: () => [],
    handleTrackContextMenuSelection: async args => {
      actions.push(["context", args.filePath]);
      if (args.selection && args.onCustomSelect) await args.onCustomSelect(args.selection);
    }
  };
  const audio = {
    localAudioControls: {
      playTrackAtIndex: index => actions.push(["play", index]),
      queue: {
        reorder: (...args) => actions.push(["reorder", ...args]),
        append: tracks => actions.push(["append", tracks])
      }
    },
    localPlayerState$,
    queue$
  };
  const local = {
    localMusicState$,
    librarySettings$,
    DEFAULT_LOCAL_PLAYLIST_ID: "local"
  };
  const dnd = {
    useDragDrop: () => drag,
    DroppableZone: props => React.createElement("drop-zone", {
      ...props,
      children: null
    }),
    DraggableItem: Wrapper,
    PLAYLIST_DRAG_ZONE_ID: "queue",
    MEDIA_LIBRARY_DRAG_ZONE_ID: "library"
  };
  let counts = {},
    listData = [];
  const count = n => counts[n] = (counts[n] ?? 0) + 1;
  const {
    useStableCallback
  } = load("packages/runtime-utils/src/index.ts");
  const runtime = {
    perfCount: count,
    perfLog: noop,
    useStableCallback
  };
  const {
    useListItemStyles
  } = load("apps/music/src/hooks/useListItemStyles.ts");
  const {
    TrackItem
  } = load("apps/music/src/components/TrackItem.tsx", {
    "./Button": {
      Button: "button"
    },
    "./LocalAudioPlayer": audio,
    "./PlaybackIndicator": {
      PlaybackIndicator: "indicator"
    },
    "../hooks/useListItemStyles": {
      useListItemStyles
    },
    "../systems/Icon": {
      Icon: "icon"
    },
    "../theme/ThemeProvider": {
      themeState$: state.observable({
        customColors: {
          dark: {
            accent: {
              primary: "#abc"
            }
          }
        }
      })
    },
    "@legend-apps/runtime-utils": runtime,
    "./ProviderBadge": {
      ProviderBadge: "badge"
    }
  });
  const List = React.memo(props => {
    count("List");
    listData = props.data;
    return React.createElement(React.Fragment, null, props.data.slice(0, 20).map((item, index) => React.createElement(React.Fragment, {
      key: props.keyExtractor(item, index)
    }, props.renderItem({
      item,
      index
    }))));
  });
  function getPlaylist() {
    const {
      Playlist
    } = load("apps/music/src/components/Playlist.tsx", {
      "@legendapp/list/react-native": {
        LegendList: List
      },
      "./AIButtons": {
        AIButtons: () => null
      },
      "./Button": {
        Button: "button"
      },
      "./LocalAudioPlayer": audio,
      "./Toast": {
        showToast: noop
      },
      "./TrackItem": {
        TrackItem
      },
      "../hooks/usePlaylistSelection": {
        usePlaylistSelection: () => selection
      },
      "@legend-apps/context-menu": contextMenu,
      "@legend-apps/drag-drop": {
        DragDropView: Wrapper,
        TrackDragSource: "track-drag"
      },
      "../systems/audioFormats": {
        SUPPORTED_AUDIO_EXTENSIONS: []
      },
      "../systems/constants": {},
      "../systems/LocalMusicState": local,
      "../systems/Settings": {
        settings$
      },
      "../systems/State": {
        state$: state.observable({}),
        stateSaved$: state.observable({})
      },
      "@legend-apps/runtime-utils": runtime,
      "../utils/trackContextMenu": trackMenus,
      "./dnd": dnd
    });
    return Playlist;
  }
  const libraryUI$ = state.observable({
    selectedView: "provider-playlist",
    selectedPlaylistId: null,
    searchQuery: "",
    playlistSort: "playlist-order",
    playlistSortDirection: "asc"
  });
  const providerPlaylists = Array.from({
    length: 20
  }, (_, i) => ({
    id: "p" + i,
    provider: "spotify",
    name: "Playlist " + i,
    trackCount: 5
  }));
  const providerLibrary$ = state.observable({
    playlists: providerPlaylists,
    selectedPlaylist: providerPlaylists[0],
    selectedTracks: []
  });
  const providerSearch$ = state.observable({
    tracks: []
  });
  const spotifyStatus$ = state.observable({
      authenticated: true,
      enabled: true
    }),
    appleMusicStatus$ = state.observable({
      authenticated: true,
      enabled: true
    });
  const Button = React.memo(props => {
    if (props.children?.[0]?.type === "badge") count("ProviderButton");
    return React.createElement("button", props);
  });
  const library = {
    libraryUI$,
    library$: state.observable({
      tracks: tracks.slice()
    }),
    normalizeArtistName: x => x
  };
  const providers = {
    providerLibrary$,
    providerSearch$,
    selectProviderPlaylist: async playlist => {
      providerLibrary$.selectedPlaylist.set(playlist);
      providerLibrary$.selectedTracks.set(tracks.slice(0, 2));
    },
    searchProviders: noop
  };
  function getMediaLibrarySidebar() {
    const {
      MediaLibrarySidebar
    } = load("apps/music/src/components/MediaLibrary/Sidebar.tsx", {
      "../Button": {
        Button
      },
      "../dnd": dnd,
      "../LocalAudioPlayer": audio,
      "../Toast": {
        showToast: noop
      },
      "../../hooks/useListItemStyles": {
        useListItemStyles
      },
      "@legend-apps/context-menu": contextMenu,
      "@legend-apps/drag-drop": {
        DragDropView: Wrapper
      },
      "@legend-apps/file-dialog": {},
      "../../systems/constants": {
        SUPPORT_PLAYLISTS: true
      },
      "../../systems/LibraryState": library,
      "../../systems/LocalMusicState": local,
      "../../systems/LocalPlaylists": {},
      "@legend-apps/runtime-utils": runtime,
      "../../utils/queueActions": {},
      "../../utils/trackResolution": trackResolution,
      "./SearchBar": {
        MediaLibrarySearchBar: () => null
      },
      "../../providers/appleMusic/provider": {
        appleMusicStatus$
      },
      "../../providers/registry": providers,
      "../../providers/spotify/provider": {
        spotifyStatus$
      },
      "../../systems/State": {
        state$: state.observable({})
      },
      "../ProviderBadge": {
        ProviderBadge: "badge"
      }
    });
    return MediaLibrarySidebar;
  }
  const trackResolution = load("apps/music/src/utils/trackResolution.ts", {
    "../systems/LibraryState": library,
    "../systems/localMusicConstants": { DEFAULT_LOCAL_PLAYLIST_ID: "local" },
  }, false);
  function getLibraryHook() {
    const {
      useLibraryTrackList
    } = load("apps/music/src/components/MediaLibrary/useLibraryTrackList.ts", {
      "../LocalAudioPlayer": audio,
      "../Toast": {
        showToast: noop
      },
      "../../hooks/usePlaylistSelection": {
        usePlaylistSelection: () => selection
      },
      "@legend-apps/context-menu": contextMenu,
      "../../systems/LibraryState": library,
      "../../systems/LocalMusicState": local,
      "../../systems/LocalPlaylists": {},
      "../../utils/queueActions": {},
      "../../utils/trackContextMenu": trackMenus,
      "../../utils/trackResolution": trackResolution,
      "../../providers/registry": providers,
      "@legend-apps/runtime-utils": runtime
    });
    return useLibraryTrackList;
  }
  function getTrackList() {
    const {
      TrackList
    } = load("apps/music/src/components/MediaLibrary/TrackList.tsx", {
      "@legendapp/list/react-native": {
        LegendList: List
      },
      "../AIButtons": {
        AIButtons: () => null
      },
      "../Button": {
        Button: "button"
      },
      "../dnd": dnd,
      "../LocalAudioPlayer": audio,
      "../Table": {
        Table: Wrapper,
        TableCell: Wrapper,
        TableHeader: () => null,
        TableRow: Wrapper
      },
      "../../hooks/useListItemStyles": {
        useListItemStyles: () => {
          count("LibraryTrackRow");
          return useListItemStyles();
        }
      },
      "@legend-apps/context-menu": contextMenu,
      "@legend-apps/drag-drop": {
        TrackDragSource: "track-drag"
      },
      "../../systems/Icon": {
        Icon: "icon"
      },
      "../../systems/LibraryState": library,
      "../../systems/LocalMusicState": local,
      "../../systems/LocalPlaylists": {},
      "../../theme/ThemeProvider": {
        themeState$: state.observable({
          customColors: {
            dark: {
              accent: {
                primary: "#abc"
              }
            }
          }
        })
      },
      "./useLibraryTrackList": {
        useLibraryTrackList: getLibraryHook()
      },
      "../../providers/registry": providers,
      "../ProviderBadge": {
        ProviderBadge: "badge"
      }
    });
    return TrackList;
  }
  return {
    React,
    act,
    create,
    state,
    TrackItem,
    getPlaylist,
    getMediaLibrarySidebar,
    getTrackList,
    getLibraryHook,
    tracks,
    queue$,
    localMusicState$,
    librarySettings$,
    libraryUI$,
    library,
    providerLibrary$,
    providerPlaylists,
    actions,
    menus,
    menuResponses,
    getCounts: () => ({
      ...counts
    }),
    resetCounts: () => {
      counts = {};
    },
    getListData: () => listData
  };
};
