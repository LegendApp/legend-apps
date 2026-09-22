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
