import { observable } from "@legendapp/state";
import { AppState } from "react-native";

const initialState = AppState.currentState;

export const appState$ = observable({
    isActive: initialState === "active",
    state: initialState,
});

AppState.addEventListener("change", (nextAppState) => {
    console.log("app state", nextAppState);
    appState$.set({
        isActive: nextAppState === "active",
        state: nextAppState,
    });
});
