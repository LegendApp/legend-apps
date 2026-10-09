import { dropletField } from "./DropletField";
import { dropletMaterial } from "./DropletMaterial";
import { dropletGeometry } from "./DropletGeometry";
import { atmosphereCommon } from "./common";
import { Atmosphere, type AtmosphereProps } from "./Atmosphere";
export const dropletsSource = atmosphereCommon + `
    ${dropletGeometry}
    uniform float titleFeed;
    uniform float backgroundTime;
    uniform float4 drops[72];
    uniform float stepIndex;
    uniform float stepTime;
    uniform float4 bestRect;
    ${dropletField}
    float3 dropletDistance(float2 p, float t) {
      float3 a=circleField(p,backgroundDroplet(0,t));
      float3 b=circleField(p,backgroundDroplet(1,t));
      float3 c=circleField(p,backgroundDroplet(2,t));
      float3 d=circleField(p,backgroundDroplet(3,t));
      float3 e=circleField(p,backgroundDroplet(4,t));
      float3 f=circleField(p,backgroundDroplet(5,t));
      float3 field=mergeField(mergeField(mergeField(a,b,0.09),mergeField(c,d,0.09),0.09),mergeField(e,f,0.09),0.09);
      // Buds and parent surfaces share one distance field and one material.
      if(titleFeed>0.5 && stepIndex==1.0) {
        for(int i=0;i<18;i++) {
          float4 drop=drops[i];
          if(drop.w!=0.0 || drop.z<0.1) continue;
          float2 pos=(drop.xy-float2(960,540))/1080.0;
          field=mergeField(field,circleField(p,float3(pos,drop.z/1080.0)),0.025);
        }
      }
      return field;
    }
    ${dropletMaterial}
    half4 main(float2 position) {
      float2 p = (position-resolution*.5)/(min(resolution.x/1920.0,resolution.y/1080.0)*1080.0);
      float t = (titleFeed>0.5 ? backgroundTime : time) * 0.6;
      float3 field = dropletDistance(p, t);
      float2 gradient = field.yz;
      float2 normal = gradient / max(length(gradient), 0.00001);
      float3 color=shadeDroplet(p,field.x,normal);
      return half4(color * brightness, 1.0);
    }
  `;
export function Droplets(props: AtmosphereProps) { return <Atmosphere {...props} source={dropletsSource} persistentBackground={true} />; }
