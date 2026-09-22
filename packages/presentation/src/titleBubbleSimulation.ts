export type TitleDrop = { x: number; y: number; vx: number; vy: number; age: number; radius: number; phase: number; hitX: number; hitY: number; initialDistance: number; whiten: number };
export type TitleBubbles = { time: number; volume: number; scale: number; velocity: number; drops: TitleDrop[] };
export function createTitleBubbles(): TitleBubbles {
  "worklet";
  const drops: TitleDrop[]=[];
  for(let i=0;i<18;i++) drops.push({x:0,y:0,vx:0,vy:0,age:-i*0.75,radius:0,phase:0,hitX:0,hitY:0,initialDistance:0,whiten:0});
  return {time:0,volume:0,scale:1,velocity:0,drops};
}
export function titleParent(i: number,t: number) {
  "worklet";
  const bodies=[[-.36+Math.sin(t*.85)*.21,.16+Math.cos(t*.67)*.09,.185],[.04+Math.cos(t*.92)*.23,.19+Math.sin(t*.73)*.10,.155],[.38+Math.sin(t*.79+1.4)*.19,-.19+Math.cos(t*.91)*.14,.14],[-.32+Math.cos(t*.76+.7)*.22,-.22+Math.sin(t*.88)*.12,.13],[.03+Math.sin(t*.69+2.1)*.26,-.12+Math.cos(t*.83)*.20,.105],[.42+Math.cos(t*.81+2.8)*.17,.21+Math.sin(t*.95)*.11,.115]];
  const b=bodies[i];return [960+b[0]*1080,540+b[1]*1080,b[2]*1080];
}
/** Fixed substeps keep attraction stable across dropped frames. Only collisions add volume. */
export function advanceTitleBubbles(previous: TitleBubbles, elapsed: number, backgroundTime: number, rect: number[], targets: number[][]): TitleBubbles {
  "worklet";
  const drops: TitleDrop[]=[];
  for(let i=0;i<previous.drops.length;i++) drops.push({...previous.drops[i]});
  const state={...previous,drops};
  const count=Math.max(1,Math.ceil(elapsed*120)),dt=elapsed/count;
  const cx=rect[0]+rect[2]/2,cy=rect[1]+rect[3]/2;
  for(let tick=0;tick<count;tick++) {
    state.time+=dt;
    for(let i=0;i<18;i++) {
      const d=state.drops[i];
      const ramp=1+Math.min(2,state.time/15);
      d.age+=dt*(d.phase===0?ramp:1);
      if(d.age<0) continue;
      if(d.phase===0) {
        const parent=titleParent(i%6,(backgroundTime-(elapsed-tick*dt)*.288)*.6);
        const ox=(parent[0]-960),oy=(parent[1]-540),len=Math.max(1,Math.hypot(ox,oy));
        const nx=ox/len,ny=oy/len;
        d.radius=(19+Math.min(23,state.time*.7))*Math.min(1,d.age/.65);
        const reach=parent[2]+Math.min(1,d.age/1.4)*55;
        d.x=parent[0]+nx*reach;d.y=parent[1]+ny*reach;
        if(d.age>=1.4){d.phase=1;d.age=0;d.vx=nx*95;d.vy=ny*95;}
      } else if(d.phase===1) {
        // Targets come from actual ink pixels, not the center of the word's box.
        const centering=Math.min(1,Math.max(0,(state.scale-1)/1.5));
        // Select the closest surface in the word's current transformed pose.
        // Below the word this naturally selects a lower glyph contour.
        let target=targets[0] ?? [cx,cy];
        let nearest=Infinity;
        for(let j=0;j<targets.length;j++) {
          const candidate=targets[j];
          const x=cx+(960-cx)*centering+(candidate[0]-cx)*state.scale;
          const y=cy+(540-cy)*centering+(candidate[1]-cy)*state.scale;
          const distance=(x-d.x)*(x-d.x)+(y-d.y)*(y-d.y);
          if(distance<nearest){nearest=distance;target=candidate;}
        }
        const tx=cx+(960-cx)*centering+(target[0]-cx)*state.scale,ty=cy+(540-cy)*centering+(target[1]-cy)*state.scale;
        const dx=tx-d.x,dy=ty-d.y;
        const distance=Math.hypot(dx,dy);
        if(d.initialDistance===0) d.initialDistance=Math.max(1,distance);
        d.whiten=Math.max(d.whiten,Math.min(1,1-distance/d.initialDistance));
        d.vx+=(dx*2.4*ramp-d.vx*1.8)*dt;d.vy+=(dy*2.4*ramp-d.vy*1.8)*dt;
        d.x+=d.vx*dt;d.y+=d.vy*dt;
        if(Math.hypot(tx-d.x,ty-d.y)<d.radius+5) {
          d.whiten=1;state.volume+=.045*(d.radius*d.radius)/(19*19);d.phase=2;d.age=0;d.hitX=target[0];d.hitY=target[1];d.x=tx;d.y=ty;
        }
      } else {
        d.radius=Math.max(0,d.radius-dt*80);
        if(d.age>.9){d.phase=0;d.age=0;d.radius=0;d.initialDistance=0;d.whiten=0;}
      }
    }
    const targetScale=Math.sqrt(1+state.volume);
    state.velocity+=((targetScale-state.scale)*32-state.velocity*9)*dt;
    state.scale+=state.velocity*dt;
  }
  return state;
}
