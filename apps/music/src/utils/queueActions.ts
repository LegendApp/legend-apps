export type QueueAction = "play-now" | "play-next" | "enqueue";

interface QueueActionEventLike {
    shiftKey?: boolean;
    altKey?: boolean;
    optionKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    nativeEvent?: {
        shiftKey?: boolean;
        altKey?: boolean;
        optionKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
    };
}

interface GetQueueActionOptions {
    event?: QueueActionEventLike | null;
    modifierState?: Partial<{
        shift: boolean;
        option: boolean;
        alt: boolean;
        ctrl: boolean;
        meta: boolean;
    }>;
    fallbackAction?: QueueAction;
}

function hasModifier(
    modifier: "shift" | "option" | "alt" | "ctrl" | "meta",
    event?: QueueActionEventLike | null,
    modifierState?: GetQueueActionOptions["modifierState"],
): boolean {
    if (modifierState?.[modifier]) {
        return true;
    }

    if (modifier === "option" && modifierState?.alt) {
        return true;
    }

    if (!event) {
        return false;
    }

    let value: boolean | undefined;
    switch (modifier) {
        case "shift":
            value = event.shiftKey;
            break;
        case "alt":
        case "option":
            value = event.altKey ?? (event as { optionKey?: boolean }).optionKey;
            break;
        case "ctrl":
            value = event.ctrlKey;
            break;
        case "meta":
            value = event.metaKey;
            break;
        default:
            value = undefined;
            break;
    }

    if (typeof value === "boolean" && value) {
        return true;
    }

    const nativeEvent = (event as { nativeEvent?: QueueActionEventLike["nativeEvent"] }).nativeEvent;
    if (!nativeEvent) {
        return false;
    }

    let nativeValue: boolean | undefined;
    switch (modifier) {
        case "shift":
            nativeValue = nativeEvent.shiftKey;
            break;
        case "alt":
        case "option":
            nativeValue = nativeEvent.altKey ?? (nativeEvent as { optionKey?: boolean }).optionKey;
            break;
        case "ctrl":
            nativeValue = nativeEvent.ctrlKey;
            break;
        case "meta":
            nativeValue = nativeEvent.metaKey;
            break;
        default:
            nativeValue = undefined;
            break;
    }

    return typeof nativeValue === "boolean" && nativeValue;
}

export function getQueueAction(options: GetQueueActionOptions = {}): QueueAction {
    const { event, modifierState } = options;

    if (
        hasModifier("alt", event, modifierState) ||
        hasModifier("option", event, modifierState) ||
        hasModifier("ctrl", event, modifierState)
    ) {
        return "play-now";
    }

    if (hasModifier("shift", event, modifierState)) {
        return "play-next";
    }

    return "enqueue";
}
