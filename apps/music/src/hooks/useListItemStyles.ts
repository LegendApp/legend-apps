import { useMemo } from "react";

import { cn } from "@/utils/cn";

export type ListItemVariant = "default" | "compact";

interface RowOptions {
    variant?: ListItemVariant;
    isActive?: boolean;
    isSelected?: boolean;
    isInteractive?: boolean;
    className?: string;
}

interface MetaOptions {
    className?: string;
}

export interface ListItemTextPalette {
    primary: string;
    secondary: string;
    muted: string;
    meta: string;
}

export interface ListItemStyles {
    getRowClassName: (options?: RowOptions) => string;
    getMetaClassName: (options?: MetaOptions) => string;
    text: ListItemTextPalette;
    activeRowClassName: string;
    hoverRowClassName: string;
}

export function useListItemStyles(): ListItemStyles {
    return useMemo(() => {
        const baseRow = "relative flex-row items-center px-3 border border-transparent";
        const rowVariants: Record<ListItemVariant, string> = {
            default: "min-h-11",
            compact: "h-8",
        };
        const hoverRow = "hover:bg-white/10 active:bg-white/15 hover:border-white/10";
        const activeRow = "";
        const selectedRow = "bg-white/10";

        const textPalette: ListItemTextPalette = {
            primary: "text-text-primary",
            secondary: "text-text-secondary",
            muted: "text-text-tertiary",
            meta: "tabular-nums text-text-secondary",
        };

        const getRowClassName = ({
            variant = "default",
            isActive = false,
            isSelected = false,
            isInteractive = true,
            className,
        }: RowOptions = {}): string =>
            cn(
                baseRow,
                rowVariants[variant],
                isInteractive ? hoverRow : "",
                isActive ? activeRow : "",
                isSelected ? selectedRow : "",
                className,
            );

        const getMetaClassName = ({ className }: MetaOptions = {}): string => cn(textPalette.meta, className);

        return {
            getRowClassName,
            getMetaClassName,
            text: textPalette,
            activeRowClassName: activeRow,
            hoverRowClassName: hoverRow,
        };
    }, []);
}
