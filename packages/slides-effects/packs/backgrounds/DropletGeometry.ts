export const dropletGeometry = `
float3 backgroundDroplet(int i, float t) {
  if(i==0) return float3(float2(-0.36 + sin(t * 0.85) * 0.21, 0.16 + cos(t * 0.67) * 0.09),0.185);
  if(i==1) return float3(float2(0.04 + cos(t * 0.92) * 0.23, 0.19 + sin(t * 0.73) * 0.10),0.155);
  if(i==2) return float3(float2(0.38 + sin(t * 0.79 + 1.4) * 0.19, -0.19 + cos(t * 0.91) * 0.14),0.14);
  if(i==3) return float3(float2(-0.32 + cos(t * 0.76 + 0.7) * 0.22, -0.22 + sin(t * 0.88) * 0.12),0.13);
  if(i==4) return float3(float2(0.03 + sin(t * 0.69 + 2.1) * 0.26, -0.12 + cos(t * 0.83) * 0.20),0.105);
  if(i==5) return float3(float2(0.42 + cos(t * 0.81 + 2.8) * 0.17, 0.21 + sin(t * 0.95) * 0.11),0.115);
  return float3(0);
}
`;
