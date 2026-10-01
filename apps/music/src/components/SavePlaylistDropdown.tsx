import { createHotkeyRouter, useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { Button } from "./Button";
import { DropdownMenu } from "./DropdownMenu";
import { TextInputSearch, type TextInputSearchRef } from "./TextInputSearch";
import { savePlaylistUI$ } from "../state/savePlaylistUIState";
const savePlaylistHotkeyRouter = createHotkeyRouter();
const closeDefinitions = [{ id: "close", title: "Close Playlist Dialog", defaultBindings: ["Escape"], allowExtraModifiers: true }];
const saveDefinitions = [{ id: "save", title: "Save Playlist", defaultBindings: ["Enter"], allowExtraModifiers: true }];

type SavePlaylistDropdownProps = {
    disabled?: boolean;
    onSave: (playlistName: string) => Promise<boolean> | boolean;
};

export function SavePlaylistDropdown({ disabled = false, onSave }: SavePlaylistDropdownProps) {
    const isOpen$ = savePlaylistUI$.isOpen;
    const isOpen = useValue(isOpen$);
    const playlistName$ = useObservable("");
    const textInputRef = useRef<TextInputSearchRef>(null);
    const [isSaving, setIsSaving] = useState(false);

    const close = useCallback(() => {
        isOpen$.set(false);
    }, [isOpen$]);

    const canSave = useCallback(() => {
        if (disabled || isSaving) {
            return false;
        }
        return playlistName$.peek().trim().length > 0;
    }, [disabled, isSaving, playlistName$]);

    const handleSave = useCallback(async () => {
        if (!canSave()) {
            return;
        }
        const name = playlistName$.peek().trim();
        setIsSaving(true);
        try {
            const didSave = await onSave(name);
            if (didSave) {
                close();
            } else {
                setTimeout(() => {
                    textInputRef.current?.focus();
                }, 0);
            }
            setIsSaving(false);
        } catch (error) {
            setIsSaving(false);
            throw error;
        }
    }, [canSave, close, onSave, playlistName$]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        playlistName$.set("");
        setTimeout(() => {
            textInputRef.current?.focus();
        }, 0);
    }, [isOpen, playlistName$]);

    const playlistName = useValue(playlistName$);
    useRoutedHotkeys({
        router: savePlaylistHotkeyRouter, definitions: closeDefinitions,
        scope: { kind: "window", windowId: "main" }, enabled: isOpen,
        handlers: { close }, onError: console.error,
    });
    useRoutedHotkeys({
        router: savePlaylistHotkeyRouter, definitions: saveDefinitions,
        scope: { kind: "window", windowId: "main" },
        enabled: isOpen && !disabled && !isSaving && playlistName.trim().length > 0,
        handlers: { save: () => { void handleSave(); } }, onError: console.error,
    });

    return (
        <DropdownMenu.Root isOpen$={isOpen$}>
            <DropdownMenu.Trigger asChild disabled={disabled}>
                <Button
                    icon="square.and.arrow.down"
                    variant="icon-hover"
                    size="xs"
                    iconSize={14}
                    iconYOffset={2}
                    tooltip="Save playlist"
                    disabled={disabled}
                />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content directionalHint="topCenter" minWidth={320} maxWidth={320} setInitialFocus scrolls={false}>
                <View className="p-3 bg-background-tertiary border border-border-primary rounded-md gap-2">
                    <Text className="text-text-secondary text-xs font-medium">Save playlist</Text>
                    <View className="bg-background-secondary border border-border-primary rounded-md px-3 py-1.5">
                        <TextInputSearch
                            ref={textInputRef}
                            value$={playlistName$}
                            placeholder="Playlist name"
                            className="text-sm text-text-primary"
                        />
                    </View>
                    <View className="flex-row justify-end gap-2">
                        <Button variant="secondary" size="small" onClick={close}>
                            <Text className="text-white text-sm">Cancel</Text>
                        </Button>
                        <Button variant="primary" size="small" onClick={() => void handleSave()} disabled={!canSave()}>
                            <Text className="text-white text-sm font-medium">Save</Text>
                        </Button>
                    </View>
                </View>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
