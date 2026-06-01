import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { DropdownMenu } from "@/components/DropdownMenu";
import { TextInputSearch, type TextInputSearchRef } from "@/components/TextInputSearch";
import { savePlaylistUI$ } from "@/state/savePlaylistUIState";
import KeyboardManager, { KeyCodes } from "@/systems/keyboard/KeyboardManager";

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
        } finally {
            setIsSaving(false);
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

    useEffect(() => {
        if (!isOpen) {
            return;
        }

            return KeyboardManager.addKeyDownListener((event) => {
                if (event.keyCode === KeyCodes.KEY_ESCAPE) {
                    close();
                    return true;
                }

                if (event.keyCode === KeyCodes.KEY_RETURN) {
                    if (canSave()) {
                        void handleSave();
                        return true;
                    }
                }

                return false;
            });
    }, [canSave, close, handleSave, isOpen]);

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
