import { observable } from "@legendapp/state";

export const playlistNavigationState$ = observable({
    hasSelection: false,
    isSearchDropdownOpen: false,
});
