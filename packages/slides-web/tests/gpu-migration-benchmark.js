// Load this in an exported deck, after generating gpu-migration-fixtures.json.
// Measures fixed shader workloads with GPU timers, without an animation loop.
window.benchmarkGPUMigration = async (name, repetitions = 5) => {
  const kit=window.CanvasKit, fixtures=await fetch('./gpu-migration-fixtures.json').then(r=>r.json());
  const f=fixtures.find(f=>f.name===name); if(!f)throw new Error('Unknown fixture '+name);
  const adapter=await navigator.gpu.requestAdapter();
  const device=await adapter.requestDevice({requiredFeatures:['timestamp-query']});
  const failures=[];device.addEventListener('uncapturederror',e=>failures.push(e.error.message));
  const module=device.createShaderModule({code:f.code});
  const info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));
  const format='rgba8unorm',fieldFormat=f.composite?'rgba16float':format;
  const target=device.createTexture({size:[f.width,f.height],format,usage:16|1});
  const field=f.composite?device.createTexture({size:[f.width,f.height],format:fieldFormat,usage:16|4}):target;
  const clock=device.createBuffer({size:32,usage:64|8});
  const states=[0,1].map(()=>device.createBuffer({size:f.particleCount*16,usage:128|8}));
  const sampler=device.createSampler({minFilter:'linear',magFilter:'linear'});
  let bitmap,imageTexture,skImage,child;
  if(f.image) {
    const manifest=await fetch('./export.json').then(r=>r.json());
    const asset=manifest.preload.find(a=>a.source?.includes(f.image==='poop'?'poop':'legend-slides-screenshot'));
    if(!asset)throw new Error('Missing texture '+f.image);
    const bytes=await fetch(asset.source).then(r=>r.arrayBuffer());
    bitmap=await createImageBitmap(new Blob([bytes]));skImage=kit.MakeImageFromEncoded(bytes);
    imageTexture=device.createTexture({size:[bitmap.width,bitmap.height],format,usage:4|2|16});
    device.queue.copyExternalImageToTexture({source:bitmap},{texture:imageTexture,premultipliedAlpha:true},[bitmap.width,bitmap.height]);
    const scale=f.image==='screenshot'?[1040/skImage.width(),710.638/skImage.height()]:[256/skImage.width(),256/skImage.height()];
    child=skImage.makeShaderOptions(kit.TileMode.Clamp,kit.TileMode.Clamp,kit.FilterMode.Linear,kit.MipmapMode.None,kit.Matrix.scaled(...scale));
  } else if(f.baseline?.includes('uniform shader')) {
    const effect=kit.RuntimeEffect.Make('half4 main(float2 p){return half4(0);}');child=effect.makeShader([]);effect.delete();
  }
  let dataBuffer;
  if(f.frameDataSize) {
    dataBuffer=device.createBuffer({size:f.frameDataSize*4,usage:128|8});
    const data=new Float32Array(f.frameDataSize);
    for(let i=0;i<18;i++){data.set([200+(i%6)*300,200+Math.floor(i/6)*300,24+i,1,.5,0,0,0],i*8);}
    data.set([1,1,4,4],576);device.queue.writeBuffer(dataBuffer,0,data);
  }
  const entries=[{binding:0,visibility:7,buffer:{type:'uniform'}},{binding:1,visibility:7,buffer:{type:'read-only-storage'}},{binding:2,visibility:4,buffer:{type:'storage'}}];
  if(imageTexture)entries.push({binding:3,visibility:2,sampler:{}},{binding:4,visibility:2,texture:{}});
  if(dataBuffer)entries.push({binding:5,visibility:3,buffer:{type:'read-only-storage'}});
  const layout=device.createBindGroupLayout({entries});
  const group=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:clock}},{binding:1,resource:{buffer:states[0]}},{binding:2,resource:{buffer:states[1]}},
    ...(imageTexture?[{binding:3,resource:sampler},{binding:4,resource:imageTexture.createView()}]:[]),...(dataBuffer?[{binding:5,resource:{buffer:dataBuffer}}]:[])]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const base=device.createRenderPipeline({layout:pipelineLayout,vertex:{module,entryPoint:'vertexMain'},fragment:{module,entryPoint:'fragmentMain',targets:[{format:fieldFormat}]}});
  const particles=device.createRenderPipeline({layout:pipelineLayout,vertex:{module,entryPoint:'particleVertex'},fragment:{module,entryPoint:'particleFragment',targets:[{format:fieldFormat,blend:{
    color:{srcFactor:'one',dstFactor:f.over?'one-minus-src-alpha':'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]}});
  let composite,compositeGroup;
  if(f.composite){
    const lensLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:2,sampler:{}},{binding:1,visibility:2,texture:{}}]});
    compositeGroup=device.createBindGroup({layout:lensLayout,entries:[{binding:0,resource:sampler},{binding:1,resource:field.createView()}]});
    composite=device.createRenderPipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layout,lensLayout]}),vertex:{module,entryPoint:'vertexMain'},fragment:{module,entryPoint:'compositeFragment',targets:[{format}]}});
  }
  const query=device.createQuerySet({type:'timestamp',count:f.composite?4:2});
  const resolve=device.createBuffer({size:32,usage:512|4}),read=device.createBuffer({size:32,usage:1|8});
  async function gpu(time){
    device.queue.writeBuffer(clock,0,new Float32Array([time,0,0,f.step,f.width/f.height,1,f.slideTime??time,time]));
    const encoder=device.createCommandEncoder();
    const pass=encoder.beginRenderPass({colorAttachments:[{view:field.createView(),clearValue:[0,0,0,0],loadOp:'clear',storeOp:'store'}],timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}});
    pass.setBindGroup(0,group);pass.setPipeline(base);pass.draw(3);pass.setPipeline(particles);pass.draw(6,f.particleCount);pass.end();
    if(composite){const pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:[0,0,0,0],loadOp:'clear',storeOp:'store'}],timestampWrites:{querySet:query,beginningOfPassWriteIndex:2,endOfPassWriteIndex:3}});
      pass.setPipeline(composite);pass.setBindGroup(0,group);pass.setBindGroup(1,compositeGroup);pass.draw(3);pass.end();}
    encoder.resolveQuerySet(query,0,f.composite?4:2,resolve,0);encoder.copyBufferToBuffer(resolve,0,read,0,32);device.queue.submit([encoder.finish()]);
    await read.mapAsync(1);const ticks=new BigUint64Array(read.getMappedRange());
    const ms=Number(ticks[1]-ticks[0]+(f.composite?ticks[3]-ticks[2]:0n))/1e6;read.unmap();return ms;
  }
  let surface,paint,effect,gl,timer;
  if(f.baseline){
    const canvas=document.createElement('canvas');canvas.width=f.width;canvas.height=f.height;
    surface=kit.MakeWebGLCanvasSurface(canvas);if(!surface)throw new Error('No CanvasKit GPU surface');
    gl=canvas.getContext('webgl2');timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!timer)throw new Error('No WebGL GPU timer');
    effect=kit.RuntimeEffect.Make(f.baseline,message=>failures.push(message));if(!effect)throw new Error('Invalid baseline shader');
    paint=new kit.Paint();
  }
  async function skia(time,residual=false){
    const values={...f.uniforms,...(residual?f.residual:{}),time:f.slideTime??time,stepTime:time,stepIndex:f.step};
    const uniforms=Array.from({length:effect.getUniformCount()},(_,i)=>values[effect.getUniformName(i)]).flat();
    if(uniforms.some(v=>!Number.isFinite(v)))throw new Error('Missing Skia uniform');
    const shader=child?effect.makeShaderWithChildren(uniforms,[child]):effect.makeShader(uniforms);paint.setShader(shader);
    const query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
    surface.getCanvas().clear(kit.TRANSPARENT);surface.getCanvas().drawRect(kit.XYWHRect(0,0,f.width,f.height),paint);surface.flush();gl.endQuery(timer.TIME_ELAPSED_EXT);
    for(let i=0;!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);i++){if(i>300)throw new Error('Timer timeout');await new Promise(r=>setTimeout(r,5));}
    if(gl.getParameter(timer.GPU_DISJOINT_EXT))throw new Error('Disjoint GPU timer');
    const ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);paint.setShader(null);shader.delete();return ms;
  }
  const samples=[];
  try {
    for(const time of f.times){await gpu(time);if(effect){await skia(time);if(f.residual)await skia(time,true);}}
    for(let repetition=0;repetition<repetitions;repetition++)for(const time of f.times){
      let baseline=null,candidate,residual=0;
      if(repetition%2){candidate=await gpu(time);if(f.residual)residual=await skia(time,true);if(effect)baseline=await skia(time);}
      else{if(effect)baseline=await skia(time);candidate=await gpu(time);if(f.residual)residual=await skia(time,true);}
      samples.push({repetition,time,baseline,candidate:candidate+residual,gpu:candidate,residual});
    }
    if(failures.length)throw new Error(failures.join('\n'));
    return {name,environment:{browser:navigator.userAgent,adapter:adapter.info,width:f.width,height:f.height},samples};
  } finally {paint?.delete();effect?.delete();surface?.delete();child?.delete();skImage?.delete();bitmap?.close();device.destroy();}
};
