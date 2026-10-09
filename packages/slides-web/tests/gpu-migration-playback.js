// Run while the collaborative preview is visible or recording.
window.auditGPUMigration = async () => {
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const player=window.__legendSlides,writes=[],queueIDs=new WeakMap();let nextID=0;
  const original=GPUQueue.prototype.writeBuffer;
  GPUQueue.prototype.writeBuffer=function(buffer,offset,data,...args){
    if(data.byteLength===32){if(!queueIDs.has(this))queueIDs.set(this,++nextID);writes.push({queue:queueIDs.get(this),at:performance.now(),clock:Array.from(new Float32Array(data.buffer,data.byteOffset,8))});}
    return original.call(this,buffer,offset,data,...args);
  };
  const results=[];
  try {
    for(const [name,slide,step,queues] of [['shatter',47,1,1],['sprites',12,1,1],['portal',34,0,1],['pipes',33,0,2],['title',0,1,1]]){
      player.goTo(slide,step);await sleep(2400);
      const samples=[];
      for(let sample=0;sample<3;sample++){
        const start=writes.length,at=performance.now();await sleep(1000);
        const recent=writes.slice(start),ids=[...new Set(recent.map(f=>f.queue))];
        if(ids.length!==queues)throw new Error(name+' missing live GPU queues: '+ids.length);
        samples.push({milliseconds:performance.now()-at,frames:ids.map(id=>recent.filter(f=>f.queue===id).length)});
      }
      const canvases=[...document.querySelectorAll('canvas[id^=rnwgpu]')];
      for(const canvas of canvases){const box=canvas.getBoundingClientRect();if(Math.abs(canvas.width-box.width*devicePixelRatio)>1||Math.abs(canvas.height-box.height*devicePixelRatio)>1)throw new Error('Incorrect GPU canvas resolution');}
      results.push({name,samples,canvases:canvases.length});
    }
    player.goTo(33,0);await sleep(1500);
    const before=writes.at(-1);player.goTo(33,1);await sleep(250);
    const after=writes.filter(w=>w.queue===before.queue).at(-1);
    if(after.clock[6]<=before.clock[6]||after.clock[7]>=.5)throw new Error('Pipe ambient clock reset on impact');
    const notes=document.querySelector('button[aria-controls="speaker-notes"]'),expanded=notes?.getAttribute('aria-expanded');
    notes?.click();await sleep(250);
    const resized=writes.filter(w=>w.queue===after.queue).at(-1);
    if(resized.clock[6]<=after.clock[6]||resized.clock[2]<=after.clock[2])throw new Error('Resize reset playback');
    if(notes&&notes.getAttribute('aria-expanded')!==expanded)notes.click();
    player.goTo(46);await sleep(900);const stopped=writes.length;await sleep(250);
    if(writes.length!==stopped||document.querySelector('canvas[id^=rnwgpu]'))throw new Error('Removed effect kept submitting');
    if(player.errors.length||player.getState().runtimeErrors.length)throw new Error('Player reported errors: '+player.getState().runtimeErrors.join('\n'));
    return {results,impactClockPreserved:true,resizePreserved:true,cleanup:true};
  } finally {GPUQueue.prototype.writeBuffer=original;}
};
