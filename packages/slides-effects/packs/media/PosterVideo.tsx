import { NativeVideoView } from "@legend-apps/presentation";
import { useContext, useState } from "react";
import { Image } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { RecordingPositionContext } from "./RecordingPosition";
export function PosterVideo({ source, poster, playing, looping = true, position: playbackPosition }: {
 source: string; poster: string; playing: boolean; looping?: boolean; position?: SharedValue<number>;
}) {
  const carouselPosition = useContext(RecordingPositionContext);
  const position = playbackPosition ?? carouselPosition;
  const [started, setStarted] = useState(playing);
  if (playing && !started) setStarted(true);
  if (!started) return <Image source={{ uri: poster }} resizeMode="contain" style={{ width: "100%", height: "100%" }} />;
  return <NativeVideoView source={source} poster={poster} playing={playing} position={position} looping={looping} />;
}
