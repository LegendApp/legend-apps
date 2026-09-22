import { useAnimatedReaction, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { usePlayback } from "./playback";
import { advanceTitleBubbles, createTitleBubbles } from "./titleBubbleSimulation";

/** Title-specific simulation; all motion runs on the host UI thread. */
export function useTitleBubbleSimulation(base: { readonly value: Record<string, number | number[]> }, targets: number[][], visual: { readonly value: Record<string, number | number[]> }) {
  const playback=usePlayback();
  const simulation=useSharedValue(createTitleBubbles());
  const cursor=useSharedValue({key:"",time:0});
  useAnimatedReaction(()=>({clock:playback.value,uniforms:base.value}),({clock,uniforms})=>{
    const key=clock.slideKey+":"+clock.stepKey;
    if(cursor.value.key!==key) {
      if(clock.stepIndex<=1) simulation.value=createTitleBubbles();
      cursor.value={key,time:0};
    }
    if(clock.phase!=="playing" || clock.stepIndex!==1) return;
    const elapsed=Math.max(0,clock.stepTime*2-cursor.value.time);
    if(elapsed>0) simulation.value=advanceTitleBubbles(simulation.value,elapsed,uniforms.time as number,uniforms.bestRect as number[],targets);
    cursor.value={key,time:clock.stepTime*2};
  },[targets]);
  return useDerivedValue(()=>{
    const state=simulation.value;
    const drops: number[]=[];
    const impacts: number[]=[];
    const whiten: number[]=[];
    for(let i=0;i<state.drops.length;i++) {
      const d=state.drops[i];
      drops.push(d.x,d.y,d.radius,d.phase);
      whiten.push(d.whiten);
      impacts.push(d.hitX,d.hitY,d.phase===2?Math.max(0,1-d.age/.9):0);
    }
    return { ...visual.value, resolution: [1920,1080], brightness:base.value.brightness,
      titleFeed:1, backgroundTime:base.value.time, absorbedScale:state.scale, drops, impacts, whiten };
  });
}
