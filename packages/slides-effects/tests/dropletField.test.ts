// @ts-nocheck Bun test types are not included in the deck TypeScript target.
import { expect, test } from "bun:test";
import { dropletField } from "../packs/backgrounds/DropletField";

// Execute the scalar arithmetic from the actual shader, rather than a duplicate
// implementation, and compare it with the old distance-only finite difference.
const vec = (x: number, y: number, z: number) => ({ x, y, z });
const source = dropletField
  .replace(/float3 (\w+)\(([^)]*)\)/g, (_, name, args) => `function ${name}(${args.replace(/float[23]? /g, "")})`)
  .replace(/float (\w+)=/g, "let $1=");
const { circleField, mergeField } = new Function("float3", "sqrt", "max", "clamp", "mix", `${source}; return {circleField,mergeField};`)(
  vec, Math.sqrt, Math.max, (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
  (a: number, b: number, t: number) => a+(b-a)*t);
const bodies = [vec(-.13,.07,.2), vec(.15,.02,.18), vec(.04,-.12,.08)];
function oldDistance(x: number,y: number) {
  const distances=bodies.map(b=>Math.hypot(x-b.x,y-b.y)-b.z);
  const merge=(a:number,b:number,k:number)=>Math.min(a,b)-k*.25*Math.max(1-Math.abs(a-b)/k,0)**2;
  return merge(merge(distances[0],distances[1],.09),distances[2],.025);
}
test("analytic droplet field preserves smooth unions and their normals, including title buds", () => {
  const epsilon=1e-6;
  for(let x=-.5;x<.5;x+=.017) for(let y=-.5;y<.5;y+=.019) {
    const fields=bodies.map(b=>circleField({x,y},b));
    const field=mergeField(mergeField(fields[0],fields[1],.09),fields[2],.025);
    expect(field.x).toBeCloseTo(oldDistance(x,y),10);
    expect(field.y).toBeCloseTo((oldDistance(x+epsilon,y)-oldDistance(x-epsilon,y))/(2*epsilon),5);
    expect(field.z).toBeCloseTo((oldDistance(x,y+epsilon)-oldDistance(x,y-epsilon))/(2*epsilon),5);
  }
});
