import { View } from "react-native-web";
export function ScaledView({ contentWidth, contentHeight, style, children }: any) {
  const width = Array.isArray(style) ? Object.assign({}, ...style).width : style.width;
  return <View style={style}><View style={{ width: contentWidth, height: contentHeight, transformOrigin: "top left", transform: [{ scale: width / contentWidth }] }}>{children}</View></View>;
}
