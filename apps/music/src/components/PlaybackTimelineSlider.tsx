import type { Observable } from "@legendapp/state";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { PanResponder, Pressable, View } from "react-native";
import { useObservableLatest } from "@/observables/useObservableLatest";

interface PlaybackTimelineSliderProps {
    $value: Observable<number>;
    minimumValue: number;
    $maximumValue: Observable<number>;
    onSlidingComplete?: (value: number) => void;
    onSlidingStart?: () => void;
    onSlidingEnd?: () => void;
    onHoverChange?: (hovered: boolean) => void;
    disabled?: boolean;
    style?: any;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
}

export function PlaybackTimelineSlider({
    $value,
    minimumValue,
    $maximumValue,
    onSlidingComplete,
    onSlidingStart,
    onSlidingEnd,
    onHoverChange,
    disabled: disabledProp = false,
    style,
    minimumTrackTintColor = "#ffffff",
    maximumTrackTintColor = "#ffffff40",
}: PlaybackTimelineSliderProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [sliderWidth, setSliderWidth] = useState(0);
    const [progress, setProgress] = useState(0);
    const [panResponder, setPanResponder] = useState<ReturnType<typeof PanResponder.create> | null>(null);
    const isDisabled$ = useObservableLatest(disabledProp);
    const isDisabled = useValue(isDisabled$);
    const lastCommittedValueRef = useRef<number | null>(null);

    const updateProgress = useCallback(() => {
        const value = $value.get();
        const maximumValue = $maximumValue.get();
        const nextProgress = maximumValue > minimumValue ? (value - minimumValue) / (maximumValue - minimumValue) : 0;
        setProgress(Math.max(0, Math.min(1, nextProgress)));
    }, [$maximumValue, $value, minimumValue]);

    useObserveEffect(updateProgress);

    const updateValueFromLocation = useCallback(
        (locationX: number) => {
            if (sliderWidth > 0) {
                const maximumValue = $maximumValue.get();
                const percentage = Math.max(0, Math.min(1, locationX / sliderWidth));
                const newValue = minimumValue + percentage * (maximumValue - minimumValue);
                $value.set(newValue);
                setProgress(percentage);

                if (newValue !== lastCommittedValueRef.current) {
                    onSlidingComplete?.(newValue);
                    lastCommittedValueRef.current = newValue;
                }
            }
        },
        [$maximumValue, $value, minimumValue, onSlidingComplete, sliderWidth],
    );

    const handleTrackLayout = (event: LayoutChangeEvent) => {
        setSliderWidth(event.nativeEvent.layout.width);
        updateProgress();
    };

    useEffect(() => {
        setPanResponder(
            PanResponder.create({
                onStartShouldSetPanResponder: () => !isDisabled$.get(),
                onStartShouldSetPanResponderCapture: () => !isDisabled$.get(),
                onMoveShouldSetPanResponder: () => !isDisabled$.get(),
                onMoveShouldSetPanResponderCapture: () => !isDisabled$.get(),
                onPanResponderGrant: (event: GestureResponderEvent) => {
                    if (!isDisabled$.get()) {
                        lastCommittedValueRef.current = null;
                        setIsDragging(true);
                        onSlidingStart?.();
                        updateValueFromLocation(event.nativeEvent.locationX);
                    }
                },
                onPanResponderMove: (event: GestureResponderEvent) => {
                    if (!isDisabled$.get()) {
                        updateValueFromLocation(event.nativeEvent.locationX);
                    }
                },
                onPanResponderRelease: (event: GestureResponderEvent) => {
                    if (!isDisabled$.get()) {
                        updateValueFromLocation(event.nativeEvent.locationX);
                        setIsDragging(false);
                        onSlidingEnd?.();
                    }
                },
                onPanResponderTerminationRequest: () => false,
                onPanResponderTerminate: (event: GestureResponderEvent) => {
                    if (!isDisabled$.get()) {
                        updateValueFromLocation(event.nativeEvent.locationX);
                        setIsDragging(false);
                        onSlidingEnd?.();
                    }
                },
            }),
        );
    }, [isDisabled$, onSlidingEnd, onSlidingStart, updateValueFromLocation]);

    const handleHoverIn = () => {
        if (!isDisabled$.get()) {
            setIsHovered(true);
            onHoverChange?.(true);
        }
    };

    const handleHoverOut = () => {
        setIsHovered(false);
        onHoverChange?.(false);
    };

    return (
        <View style={[{ height: 40 }, style]} {...(panResponder?.panHandlers ?? {})}>
            <Pressable
                onHoverIn={handleHoverIn}
                onHoverOut={handleHoverOut}
                disabled={isDisabled}
                className="flex-1 justify-center"
            >
                <View
                    onLayout={handleTrackLayout}
                    className="rounded-full overflow-hidden"
                    style={{ backgroundColor: maximumTrackTintColor, height: isHovered || isDragging ? 8 : 3 }}
                >
                    <View
                        className="h-full rounded-l-full"
                        style={{ backgroundColor: minimumTrackTintColor, width: `${progress * 100}%` }}
                    />
                </View>
            </Pressable>
        </View>
    );
}
