import { observable } from "@legendapp/state";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PlaybackTimelineSlider } from "../PlaybackTimelineSlider";

jest.mock("react-native", () => ({
    ...jest.requireActual("react-native"),
    PanResponder: { create: (handlers: object) => ({ panHandlers: handlers }) },
}));

it("updates only the fill on playback ticks and preserves immediate scrubbing", () => {
    const value$ = observable(25);
    const maximum$ = observable(100);
    const onSlidingComplete = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
        renderer = create(<PlaybackTimelineSlider $value={value$} $maximumValue={maximum$}
            minimumValue={0} onSlidingComplete={onSlidingComplete} />);
    });
    const track = () => renderer.root.findAll((node) => typeof node.type === "string" && !!node.props.onLayout)[0]!;
    const fill = () => renderer.root.findAll((node) => typeof node.type === "string" && node.props.className === "h-full rounded-l-full")[0]!;
    const trackLayoutHandler = track().props.onLayout;
    expect(fill().props.style.width).toBe("25%");
    act(() => value$.set(50));
    expect(fill().props.style.width).toBe("50%");
    expect(track().props.onLayout).toBe(trackLayoutHandler);
    act(() => maximum$.set(200));
    expect(fill().props.style.width).toBe("25%");
    expect(track().props.onLayout).toBe(trackLayoutHandler);
    act(() => track().props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
    const responder = () => renderer.root.findAll((node) => typeof node.type === "string" && !!node.props.onPanResponderGrant)[0]!;
    act(() => responder().props.onPanResponderGrant({ nativeEvent: { locationX: 75 } }));
    expect(value$.peek()).toBe(150);
    expect(fill().props.style.width).toBe("75%");
    expect(onSlidingComplete).toHaveBeenCalledTimes(1);
    act(() => responder().props.onPanResponderRelease({ nativeEvent: { locationX: 75 } }));
    expect(onSlidingComplete).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
});
