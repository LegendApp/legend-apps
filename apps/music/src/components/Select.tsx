import type { ObservableParam } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Text } from "react-native";

import { DropdownMenu } from "@/components/DropdownMenu";
import { cn } from "@/utils/cn";

export interface SelectOption {
    label: string;
    value: string;
}

export interface SelectProps {
    options: SelectOption[];
    value$?: ObservableParam<string>;
    value?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    className?: string;
    triggerClassName?: string;
    textClassName?: string;
    disabled?: boolean;
}

export function Select({
    options,
    value$,
    value: valueProp,
    onValueChange,
    placeholder = "Select...",
    className,
    triggerClassName,
    textClassName,
    disabled = false,
}: SelectProps) {
    const value = value$ ? useValue(value$) : valueProp;

    const selectedOption = options.find((option) => option.value === value);
    const displayText = selectedOption ? selectedOption.label : placeholder;

    const handleSelect = (selectedValue: string) => {
        value$?.set(selectedValue);
        onValueChange?.(selectedValue);
    };

    return (
        <DropdownMenu.Root closeOnSelect={true}>
            <DropdownMenu.Trigger
                className={cn(
                    "bg-background-secondary hover:bg-background-tertiary rounded-md flex-row justify-between items-center overflow-hidden border border-border-primary h-8 px-2",
                    disabled && "opacity-50 pointer-events-none",
                    triggerClassName,
                )}
                disabled={disabled}
                showCaret={true}
                caretPosition="right"
            >
                <Text className={cn("text-text-primary text-sm", textClassName)} numberOfLines={1}>
                    {displayText}
                </Text>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className={className}>
                {options.map((option) => (
                    <DropdownMenu.Item
                        key={option.value}
                        onSelect={() => handleSelect(option.value)}
                        className={cn(
                            "px-3 py-2 hover:bg-background-tertiary",
                            value === option.value && "bg-background-tertiary",
                        )}
                    >
                        <Text className="text-text-primary text-sm">{option.label}</Text>
                    </DropdownMenu.Item>
                ))}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
