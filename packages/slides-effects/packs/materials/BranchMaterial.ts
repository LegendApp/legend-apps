// Shared GPU ribbon material for branching diagrams.
export const branchMaterialShader = `
float3 branchRibbon(float d,float t,float phase,float clock,float3 tint,float3 light) {
  float pulse=0.5+0.5*sin(clock*1.4-t*6.0+phase);
  float radius=mix(14.0,3.0,t)*(0.9+pulse*0.2);
  float n=d/radius;
  float body=1.0-smoothstep(0.8,1.12,abs(n));
  float edge=exp(-abs(abs(d)-radius*0.87)*0.9);
  float ridge=exp(-pow((n+0.3)*4.0,2.0));
  float flow=pow(0.5+0.5*sin(t*22.0-clock*3.0+phase),8.0);
  return tint*(body*0.35+ridge*body*0.55+exp(-abs(d)/(radius*2.0))*0.08)
    +light*(edge*0.6+flow*body*0.35);
}
`;
