import { useAnimatedReaction, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { usePlayback } from "./playback";
import { advanceTitleBubbles, createTitleBubbles, beginTitleRelease, advanceTitleRelease, titleCenterProgress } from "./titleBubbleSimulation";

/** Title-specific simulation; all motion runs on the host UI thread. */
export function useTitleBubbleSimulation(base: { readonly value: Record<string, number | number[]> }, targets: number[][], visual: { readonly value: Record<string, number | number[]> }) {
  const playback=usePlayback();
  const simulation=useSharedValue(createTitleBubbles());
  const cursor=useSharedValue({key:"",time:0});
  useAnimatedReaction(()=>({clock:playback.value,uniforms:base.value}),({clock,uniforms})=>{
    const key=clock.slideKey+":"+clock.stepKey;
    if(cursor.value.key!==key) {
      if(clock.stepIndex<=1) simulation.value=createTitleBubbles();
      if(clock.stepIndex===2) simulation.value=beginTitleRelease(simulation.value,uniforms.bestRect as number[]);
      cursor.value={key,time:0};
    }
    if(clock.phase!=="playing" || (clock.stepIndex!==1 && clock.stepIndex!==2)) return;
    const time=clock.stepTime*(clock.stepIndex===1?1.5:2);
    const elapsed=Math.max(0,time-cursor.value.time);
    if(elapsed>0) simulation.value=clock.stepIndex===2 ? advanceTitleRelease(simulation.value,elapsed,uniforms.bestRect as number[],targets) : advanceTitleBubbles(simulation.value,elapsed,uniforms.time as number,uniforms.bestRect as number[],targets);
    cursor.value={key,time};
  },[targets]);
  return useDerivedValue(()=>{
    const state=simulation.value;
    const drops: number[]=[];
    const impacts: number[]=[];
    const whiten: number[]=[];
    const necks:number[]=[];
    const releasePulls:number[]=[];
    for(let i=0;i<state.drops.length;i++) {
      const d=state.drops[i];
      drops.push(d.x,d.y,d.radius,d.phase);
      whiten.push(d.whiten);
      necks.push(d.hitX,d.hitY,d.phase===3?Math.max(0,1-d.age/.4):0,d.phase===5?Math.min(1,d.age/.45):0);
      let pull=0;
      if(d.phase===3 && d.age>=0) pull=28*Math.min(1,d.age/.4);
      if(d.phase===4 && d.age<.6) pull=28*Math.exp(-d.age*8)*Math.cos(d.age*16);
      const dx=d.phase===3?d.x-d.hitX:d.vx,dy=d.phase===3?d.y-d.hitY:d.vy;
      const length=Math.max(.001,Math.hypot(dx,dy));
      releasePulls.push(dx/length*pull,dy/length*pull,Math.abs(pull)/28,0);
      impacts.push(d.hitX,d.hitY,d.phase===2?Math.max(0,1-d.age/.9):0);
    }
    while(drops.length<288)drops.push(0);
    while(necks.length<288)necks.push(0);
    while(releasePulls.length<288)releasePulls.push(0);
    return { ...visual.value, resolution: [1920,1080], brightness:base.value.brightness,
      titleFeed:1, backgroundTime:base.value.time, absorbedScale:state.scale, centerProgress:titleCenterProgress(state.scale,base.value.bestRect as number[]), drops, impacts:impacts.slice(0,54), whiten:whiten.slice(0,18), necks, releasePulls, exitCenter:state.exitCenter ?? [960,540] };
  });
}
