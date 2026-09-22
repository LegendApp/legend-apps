import {test,expect} from "bun:test";
import {createTitleBubbles,advanceTitleBubbles} from "../titleBubbleSimulation.ts";
const rect=[1200,400,260,120],targets=[[1230,420],[1300,420],[1360,420],[1430,420]];
test("growth is caused by absorption, not elapsed time",()=>{
 let state=createTitleBubbles();
 state=advanceTitleBubbles(state,1,.288,rect,targets);
 expect(state.volume).toBe(0);expect(state.scale).toBe(1);
 for(let i=1;i<25*60;i++) state=advanceTitleBubbles(state,1/60,(1+i/60)*.288,rect,targets);
 expect(state.volume).toBeGreaterThan(0);expect(state.scale).toBeGreaterThan(1);
 expect(state.drops.every(d=>Number.isFinite(d.x)&&Number.isFinite(d.y))).toBe(true);
});
test("detached bubbles stay foreground until absorption",()=>{
 let state=createTitleBubbles();state=advanceTitleBubbles(state,1.5,.432,rect,targets);
 expect(state.drops[0].phase).toBe(1);
 expect(state.drops[0].radius).toBeGreaterThan(0);
});

test("app compiler keeps simulation array traversal inside worklets", async()=>{
 const {createRequire}=await import("node:module");
 const {fileURLToPath}=await import("node:url");
 const require=createRequire(new URL("../../../../shell/package.json",import.meta.url));
 const babel=require("@babel/core");
 const previous=process.env.LEGEND_APP;
 process.env.LEGEND_APP="slides";
 try {
  for(const file of ["useTitleBubbleSimulation.ts","titleBubbleSimulation.ts"]) {
   const output=babel.transformFileSync(fileURLToPath(new URL("../"+file,import.meta.url)),{
    configFile:fileURLToPath(new URL("../../../../shell/babel.config.js",import.meta.url)),
    cwd:fileURLToPath(new URL("../../../../shell/",import.meta.url)),
   }).code;
   expect(output).toContain("__workletHash");
   expect(output).not.toMatch(/flatMap|Array\.from|\.map\(/);
  }
 } finally { if(previous===undefined)delete process.env.LEGEND_APP;else process.env.LEGEND_APP=previous; }
});

test("bubbles below a glyph are absorbed at its lower contour",()=>{
 const initial=createTitleBubbles();
 initial.drops[0]={...initial.drops[0],phase:1,age:0,x:1330,y:525,radius:19};
 const state=advanceTitleBubbles(initial,1/120,0,rect,[[1330,410],[1330,510]]);
 expect(state.drops[0].phase).toBe(2);
 expect(state.drops[0].hitY).toBe(510);
});

test("growth stays within slide margins even with excess volume and momentum",()=>{
 const initial=createTitleBubbles();initial.volume=10000;initial.scale=3.49;initial.velocity=100;
 const state=advanceTitleBubbles(initial,1/60,0,rect,targets);
 expect(state.scale).toBeLessThanOrEqual(3.5);
 expect(state.scale*rect[2]*1.065).toBeLessThanOrEqual(1536);
 expect(state.scale*rect[3]*1.065).toBeLessThanOrEqual(756);
});
