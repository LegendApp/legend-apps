import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { View } from "react-native";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { Canvas, FitBox, Skia, Skottie, rect } from "./skia";

// Renders lottie-react-native's controlled progress API with Skia's Skottie player.
export default forwardRef<unknown, { source: object; progress?: number; resizeMode?: "contain" | "cover"; style?: any }>(function LottieView({ source, progress = 0, resizeMode = "contain", style }, ref) {
  const animation = useMemo(() => Skia.Skottie.Make(JSON.stringify(source)), [source]);
  useEffect(() => () => animation.dispose(), [animation]);
  const value = useSharedValue(progress);
  // Reanimated's web animatedProps arrive through setNativeProps.
  useImperativeHandle(ref, () => ({ setNativeProps: (props: { progress?: number }) => { if (typeof props.progress === "number") value.value = props.progress; } }), [value]);
  const frame = useDerivedValue(() => value.value * animation.duration() * animation.fps());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = animation.size();
  return <View style={style} onLayout={event => setSize(event.nativeEvent.layout)}>
    <Canvas style={{ width: "100%", height: "100%" }}>
      <FitBox fit={resizeMode} src={rect(0, 0, width, height)} dst={rect(0, 0, size.width, size.height)}>
        <Skottie animation={animation} frame={frame} />
      </FitBox>
    </Canvas>
  </View>;
});
