import type { PhotoInfo } from "../systems/FileManager";
import { photoMetadatas$ } from "../systems/PhotoMetadata";
import { getPhotoPath } from "../utils/photoHelpers";
import { use$ } from "@legendapp/state/react";
import { Image, View, type ImageProps, type ImageStyle, type StyleProp } from "react-native";
interface ImgProps extends Omit<ImageProps, "source" | "style"> {
  photo: PhotoInfo; native?: boolean; style?: StyleProp<ImageStyle>; className?: string;
}
export function Img({ photo, native: _native, style, className, onLoad, resizeMode = "contain", ...props }: ImgProps) {
  const aspect = use$(photoMetadatas$[photo.id].aspect) || 1;
  const path = getPhotoPath(photo);
  const uri = path?.startsWith("/") ? `file://${encodeURI(path).replace(/#/g, "%23").replace(/\?/g, "%3F")}` : path;
  return <View className={className} style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, style]}>
    <Image key={photo.id} {...props} source={uri ? { uri } : undefined} resizeMode={resizeMode}
      style={{ flex: 1, width: "100%", maxWidth: "100%", maxHeight: "100%", aspectRatio: aspect, borderRadius: 4 }}
      onLoad={event => {
        const {width, height} = event.nativeEvent.source;
        if (width > 0 && height > 0) photoMetadatas$[photo.id].aspect.set(Math.round(width / height * 100) / 100);
        onLoad?.(event);
      }} />
  </View>;
}
