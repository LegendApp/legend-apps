import { createObservableFile } from "@legend-apps/storage";
import type { PlaybackControlId } from "../systems/Settings";

export type MusicLayoutDirection = "horizontal" | "vertical";
export type MusicLayoutContainerType = "stack" | "split";

export type MusicLayoutLeafId =
    | "playback"
    | "playbackControls"
    | "queue"
    | "library"
    | "librarySidebar"
    | "libraryTracks";

export interface MusicLayoutContainerNode {
    type: MusicLayoutContainerType;
    id?: string;
    direction: MusicLayoutDirection;
    children?: MusicLayoutNode[];
}

export interface MusicLayoutLeafNode {
    type: "leaf";
    id: MusicLayoutLeafId;
    children?: MusicLayoutNode[];
    controls?: PlaybackControlId[];
}

export type MusicLayoutNode = MusicLayoutContainerNode | MusicLayoutLeafNode;

export interface MusicLayoutFile {
    version: 1;
    main: MusicLayoutNode;
}

export const MUSIC_LAYOUT_VERSION = 1;

export const DEFAULT_LIBRARY_LAYOUT: MusicLayoutNode = {
    type: "split",
    id: "library",
    direction: "horizontal",
    children: [
        { type: "leaf", id: "librarySidebar" },
        { type: "leaf", id: "libraryTracks" },
    ],
};

export const DEFAULT_MAIN_LAYOUT: MusicLayoutFile = {
    version: MUSIC_LAYOUT_VERSION,
    main: {
        type: "stack",
        id: "main",
        direction: "vertical",
        children: [
            { type: "leaf", id: "playback" },
            { type: "leaf", id: "queue" },
        ],
    },
};

const MAX_LAYOUT_DEPTH = 12;
const VALID_LEAF_IDS = new Set<MusicLayoutLeafId>([
    "playback",
    "playbackControls",
    "queue",
    "library",
    "librarySidebar",
    "libraryTracks",
]);
const VALID_PLAYBACK_CONTROL_IDS = new Set<PlaybackControlId>([
    "previous",
    "playPause",
    "next",
    "shuffle",
    "repeat",
    "search",
    "savePlaylist",
    "toggleLibrary",
    "spacer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneLayoutNode(node: MusicLayoutNode): MusicLayoutNode {
    const clonedChildren = node.children?.map(cloneLayoutNode);
    if (node.type === "leaf") {
        return {
            type: "leaf",
            id: node.id,
            ...(node.controls ? { controls: [...node.controls] } : {}),
            ...(clonedChildren ? { children: clonedChildren } : {}),
        };
    }

    return {
        type: node.type,
        direction: node.direction,
        ...(node.id ? { id: node.id } : {}),
        ...(clonedChildren ? { children: clonedChildren } : {}),
    };
}

export function cloneMusicLayoutFile(layout: MusicLayoutFile): MusicLayoutFile {
    return {
        version: MUSIC_LAYOUT_VERSION,
        main: cloneLayoutNode(layout.main),
    };
}

function normalizeChildren(value: Record<string, unknown>, depth: number): MusicLayoutNode[] | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, "children")) {
        return undefined;
    }

    if (!Array.isArray(value.children)) {
        return [];
    }

    return value.children.flatMap((child) => {
        const normalized = normalizeMusicLayoutNode(child, depth + 1);
        return normalized ? [normalized] : [];
    });
}

export function normalizeMusicLayoutNode(value: unknown, depth = 0): MusicLayoutNode | undefined {
    if (!isRecord(value) || depth > MAX_LAYOUT_DEPTH) {
        return undefined;
    }

    if (value.type === "stack" || value.type === "split") {
        const direction = value.direction === "horizontal" || value.direction === "vertical"
            ? value.direction
            : "vertical";
        const children = normalizeChildren(value, depth);

        return {
            type: value.type,
            direction,
            ...(typeof value.id === "string" && value.id.length > 0 ? { id: value.id } : {}),
            ...(children ? { children } : {}),
        };
    }

    if (value.type === "leaf" && typeof value.id === "string" && VALID_LEAF_IDS.has(value.id as MusicLayoutLeafId)) {
        const children = normalizeChildren(value, depth);
        const controls = Array.isArray(value.controls)
            ? value.controls.filter((controlId): controlId is PlaybackControlId =>
                  typeof controlId === "string" && VALID_PLAYBACK_CONTROL_IDS.has(controlId as PlaybackControlId),
              )
            : undefined;

        return {
            type: "leaf",
            id: value.id as MusicLayoutLeafId,
            ...(controls ? { controls } : {}),
            ...(children ? { children } : {}),
        };
    }

    return undefined;
}

export function normalizeMusicLayoutFile(value: unknown): MusicLayoutFile {
    if (isRecord(value) && value.version === MUSIC_LAYOUT_VERSION) {
        const main = normalizeMusicLayoutNode(value.main);
        if (main) {
            return {
                version: MUSIC_LAYOUT_VERSION,
                main,
            };
        }
    }

    return cloneMusicLayoutFile(DEFAULT_MAIN_LAYOUT);
}

export const mainLayout$ = createObservableFile<MusicLayoutFile>({
    filename: "mainLayout",
    initialValue: DEFAULT_MAIN_LAYOUT,
    saveDefaultToFile: true,
    subfolder: "data",
});
