import { InteractionManager } from "react-native";
import { perfLog } from "@/utils/perfLogger";

export const runAfterInteractions = (callback: () => void) => {
    return InteractionManager.runAfterInteractions(callback);
};

export const runAfterInteractionsWithLabel = (callback: () => void, label: string) => {
    const scheduledAt = Date.now();

    return InteractionManager.runAfterInteractions(() => {
        perfLog("runAfterInteractions", { label, waitMs: Date.now() - scheduledAt });
        callback();
    });
};
