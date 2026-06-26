import { observable, type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Text, View } from "react-native";

import { Icon } from "@/systems/Icon";
import { cn } from "@legend-desktop/classnames";
import { Button } from "./Button";

const fallbackChecked$ = observable(false);

export interface CheckboxProps {
    label?: string;
    $checked?: Observable<boolean>;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    labelClassName?: string;
}

export function Checkbox({
    label,
    checked: checkedProp,
    $checked,
    onChange,
    disabled = false,
    className = "",
    labelClassName = "",
}: CheckboxProps) {
    const observableChecked = useValue($checked ?? fallbackChecked$);
    const isChecked = checkedProp ?? observableChecked;

    const handlePress = () => {
        if (disabled) {
            return;
        }

        const newValue = !isChecked;
        if ($checked) {
            $checked.set(newValue);
        }
        onChange?.(newValue);
    };

    return (
        <Button
            onClick={handlePress}
            className={cn("flex flex-row items-center gap-x-2", disabled && "opacity-50", className)}
            disabled={disabled}
        >
            <View
                className={cn(
                    "size-5 rounded-md border items-center justify-center",
                    isChecked
                        ? "bg-accent-primary border-accent-primary"
                        : "bg-background-secondary border-border-primary",
                )}
            >
                {isChecked && <Icon name="checkmark" color="#FFF" size={13} yOffset={-5} />}
            </View>
            {label && <Text className={cn("text-text-primary", labelClassName)}>{label}</Text>}
        </Button>
    );
}
