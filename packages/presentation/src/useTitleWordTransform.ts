import { useDerivedValue } from "react-native-reanimated";
/** Vector word follows the same simulated pose as its shader and attraction targets. */
export function useTitleWordTransform(uniforms: {readonly value: Record<string,number|number[]>}, ink: number[], bounds: number[]) {
  return useDerivedValue(()=>{
    const u=uniforms.value,g=u.absorbedScale as number,rect=u.bestRect as number[];
    const cx=rect[0]+rect[2]/2,cy=rect[1]+rect[3]/2;
    const center=Math.min(1,Math.max(0,(g-1)/1.5));
    const t=u.stepIndex as number>=2?u.stepTime as number:0;
    const progress=Math.min(1,t/3.2),remaining=1-progress*progress*(3-2*progress);
    return [
      {translateX:cx+(960-cx)*center},{translateY:cy+(540-cy)*center},
      {rotate:t*t*2.5},{scale:Math.max(.00001,g*remaining)},
      {translateX:ink[0]-cx},{translateY:ink[1]-cy},
      {scaleX:ink[2]/Math.max(1,bounds[2])},{scaleY:ink[3]/Math.max(1,bounds[3])},
      {translateX:-bounds[0]},{translateY:-bounds[1]},
    ];
  },[ink,bounds]);
}
