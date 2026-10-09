// Install in the browser console, then await runTypeGPUAudit() on ReactCon.
// Keep the preview continuously rendering (visible or recording) during the audit.
window.runTypeGPUAudit = async ({ slide = 47, step = 2 } = {}) => {
  const player = window.__legendSlides;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const environment = { url: location.href, secure: isSecureContext, webgpu: !!navigator.gpu,
    browser: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
  const check = (passed, message) => { if (!passed) throw new Error(message); };
  if (!navigator.gpu) {
    player.goTo(slide, step);
    await sleep(500);
    check(!document.querySelector("canvas[id^=rnwgpu]"), "Unsupported browser mounted a WebGPU canvas");
    check(!player.errors.length && !player.getState().runtimeErrors.length, "Fallback reported an error");
    return { environment, unsupportedFallback: true };
  }
  const writes = [], queues = new WeakMap(), destroyed = [];
  const notesVisible = document.querySelector('button[aria-controls="speaker-notes"]')?.getAttribute("aria-expanded");
  let nextId = 0;
  const writeBuffer = GPUQueue.prototype.writeBuffer;
  const destroy = GPUDevice.prototype.destroy;
  GPUQueue.prototype.writeBuffer = function(buffer, offset, data, ...args) {
    if (data.byteLength === 32) {
      if (!queues.has(this)) queues.set(this, ++nextId);
      writes.push({ queue: queues.get(this), at: performance.now(),
        clock: Array.from(new Float32Array(data.buffer, data.byteOffset, 8)) });
    }
    return writeBuffer.call(this, buffer, offset, data, ...args);
  };
  GPUDevice.prototype.destroy = function() { destroyed.push(this); return destroy.call(this); };
  try {
    player.goTo(slide + 1);
    await sleep(350);
    writes.length = 0;
    player.goTo(slide, step);
    await sleep(2200);
    check(writes[0]?.clock[2] === 0 && writes[0].clock[0] >= 0 && writes[0].clock[0] < 1,
      "Incoming effect did not use a fresh playback clock");
    const samples = [];
    for (let run = 0; run < 3; run++) {
      const start = writes.length, at = performance.now();
      await sleep(1000);
      const frames = writes.slice(start);
      check(frames.length > 10 && frames.at(-1).clock[0] > frames[0].clock[0], "Effect did not animate");
      samples.push({ frames: frames.length, milliseconds: performance.now() - at,
        first: frames[0].clock, last: frames.at(-1).clock });
    }
    const canvas = document.querySelector("canvas[id^=rnwgpu]");
    const before = writes.at(-1);
    document.querySelector('button[aria-controls="speaker-notes"]')?.click();
    await sleep(300);
    const box = canvas.getBoundingClientRect();
    check(Math.abs(canvas.width - box.width * devicePixelRatio) <= 1 &&
      Math.abs(canvas.height - box.height * devicePixelRatio) <= 1, "Drawing buffer did not follow display size");
    const after = writes.at(-1);
    check(after.queue === before.queue && after.clock[2] > before.clock[2], "Resize restarted the simulation");
    player.goTo(slide, step + 1);
    await sleep(350);
    const stoppedAt = writes.length;
    await sleep(300);
    check(writes.length === stoppedAt && destroyed.length > 0, "Removed effect kept submitting frames");
    check(!document.querySelector("canvas[id^=rnwgpu]"), "Removed effect kept its canvas");
    player.goTo(slide, step);
    await sleep(350);
    const reentry = writes[stoppedAt];
    check(reentry?.clock[0] >= 0 && reentry.clock[0] < 1 && reentry.clock[2] === 0, "Reentered effect did not reset");
    check(!player.errors.length && !player.getState().runtimeErrors.length, "Player reported an error");
    return { environment, first: writes[0].clock, samples, resize: { width: canvas.width, height: canvas.height },
      stopped: true, reentry: reentry.clock, destroyedDevices: destroyed.length };
  } finally {
    GPUQueue.prototype.writeBuffer = writeBuffer;
    GPUDevice.prototype.destroy = destroy;
    const notes = document.querySelector('button[aria-controls="speaker-notes"]');
    if (notes && notes.getAttribute("aria-expanded") !== notesVisible) notes.click();
  }
};
