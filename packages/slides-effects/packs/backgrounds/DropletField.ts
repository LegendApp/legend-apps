/** Distance and analytic gradient travel together through the smooth union.
 * Components are (distance, derivative x, derivative y).
 */
export const dropletField = `
float3 circleField(float2 p, float3 body) {
  float dx=p.x-body.x;
  float dy=p.y-body.y;
  float distance=sqrt(dx*dx+dy*dy);
  float inverse=1.0/max(distance,0.00001);
  return float3(distance-body.z,dx*inverse,dy*inverse);
}
float3 mergeField(float3 a,float3 b,float neck) {
  float h=clamp(0.5+0.5*(b.x-a.x)/neck,0.0,1.0);
  return float3(mix(b.x,a.x,h)-neck*h*(1.0-h),
    mix(b.y,a.y,h),mix(b.z,a.z,h));
}
`;
