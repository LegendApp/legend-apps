import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { PanResponder, Pressable, View } from "react-native";
import { useRefValue } from "@legend-apps/runtime-utils";

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
    const [panResponder, setPanResponder] = useState<ReturnType<typeof PanResponder.create> | null>(null);
    const isDisabledRef = useRefValue(disabledProp);
    const isDisabled = disabledProp;
    const lastCommittedValueRef = useRef<number | null>(null);

    const updateValueFromLocation = useCallback(
        (locationX: number) => {
            if (sliderWidth > 0) {
                const maximumValue = $maximumValue.peek();
                const percentage = Math.max(0, Math.min(1, locationX / sliderWidth));
                const newValue = minimumValue + percentage * (maximumValue - minimumValue);
                $value.set(newValue);

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
    };

    useEffect(() => {
        setPanResponder(
            PanResponder.create({
                onStartShouldSetPanResponder: () => !isDisabledRef.current,
                onStartShouldSetPanResponderCapture: () => !isDisabledRef.current,
                onMoveShouldSetPanResponder: () => !isDisabledRef.current,
                onMoveShouldSetPanResponderCapture: () => !isDisabledRef.current,
                onPanResponderGrant: (event: GestureResponderEvent) => {
                    if (!isDisabledRef.current) {
                        lastCommittedValueRef.current = null;
                        setIsDragging(true);
                        onSlidingStart?.();
                        updateValueFromLocation(event.nativeEvent.locationX);
                    }
                },
                onPanResponderMove: (event: GestureResponderEvent) => {
                    if (!isDisabledRef.current) {
                        updateValueFromLocation(event.nativeEvent.locationX);
                    }
                },
                onPanResponderRelease: (event: GestureResponderEvent) => {
                    if (!isDisabledRef.current) {
                        updateValueFromLocation(event.nativeEvent.locationX);
                        setIsDragging(false);
                        onSlidingEnd?.();
                    }
                },
                onPanResponderTerminationRequest: () => false,
                onPanResponderTerminate: (event: GestureResponderEvent) => {
                    if (!isDisabledRef.current) {
                        updateValueFromLocation(event.nativeEvent.locationX);
                        setIsDragging(false);
                        onSlidingEnd?.();
                    }
                },
            }),
        );
    }, [isDisabledRef, onSlidingEnd, onSlidingStart, updateValueFromLocation]);

    const handleHoverIn = () => {
        if (!isDisabledRef.current) {
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
                    <PlaybackTimelineFill $value={$value} $maximumValue={$maximumValue} minimumValue={minimumValue} color={minimumTrackTintColor} />
                </View>
            </Pressable>
        </View>
    );
}

function PlaybackTimelineFill({ $value, $maximumValue, minimumValue, color }: Pick<PlaybackTimelineSliderProps, "$value" | "$maximumValue" | "minimumValue"> & { color: string }) {
    const progress = useValue(() => {
        const maximumValue = $maximumValue.get();
        const value = $value.get();
        return maximumValue > minimumValue
            ? Math.max(0, Math.min(1, (value - minimumValue) / (maximumValue - minimumValue)))
            : 0;
    });
    return <View className="h-full rounded-l-full" style={{ backgroundColor: color, width: `${progress * 100}%` }} />;
}
