/** Installed before the player imports Reanimated, so every animation sees the same clock. */
export function installRenderClock() {
  const host = globalThis as any;
  const realTimeout = host.setTimeout.bind(host);
  const wait = () => new Promise<void>(resolve => realTimeout(resolve, 0));
  let now = 0, id = 0, seed = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { at: number; callback: () => void; interval?: number }>();
  Object.defineProperty(performance, "now", { value: () => now });
  const epoch = 1700000000000;
  Object.defineProperty(performance, "timeOrigin", { value: epoch });
  const RealDate = Date;
  host.Date = new Proxy(RealDate, {
    construct(target, args, receiver) { return Reflect.construct(target, args.length ? args : [epoch + now], receiver); },
    apply() { return new RealDate(epoch + now).toString(); },
    get(target, key, receiver) { return key === "now" ? () => epoch + now : Reflect.get(target, key, receiver); },
  });
  Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  host.requestAnimationFrame = (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; };
  host.cancelAnimationFrame = (key: number) => frames.delete(key);
  const timer = (callback: (...args: any[]) => void, delay = 0, interval?: number, args: any[] = []) => {
    timers.set(++id, { at: now + Math.max(0, delay), callback: () => callback(...args), interval }); return id;
  };
  host.setTimeout = (callback: (...args: any[]) => void, delay: number, ...args: any[]) => timer(callback, delay, undefined, args);
  host.setInterval = (callback: (...args: any[]) => void, delay: number, ...args: any[]) => timer(callback, delay, Math.max(1, delay), args);
  host.clearTimeout = host.clearInterval = (key: number) => timers.delete(key);
  host.requestIdleCallback = (callback: IdleRequestCallback) => timer(() => callback({ didTimeout: false, timeRemaining: () => 50 }));
  host.cancelIdleCallback = host.clearTimeout;
  const queues = new Set<{ onSubmittedWorkDone(): Promise<void> }>();
  const { GPUAdapter, GPUDevice, GPUQueue } = host;
  let pending = 0, submissions = 0;
  const errors: string[] = [];
  host.addEventListener("error", (event: ErrorEvent) => errors.push(event.message));
  host.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => errors.push(String(event.reason)));
  if (host.GPUAdapter) {
    const request = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (this: any, ...args: any[]) {
      pending++;
      try {
        const device = await request.apply(this, args);
        queues.add(device.queue);
        device.addEventListener("uncapturederror", (event: { error: { message: string } }) => errors.push(event.error.message));
        device.lost.then((info: { reason: string; message: string }) => { if (info.reason !== "destroyed") errors.push(info.message); });
        return device;
      } catch (error) { errors.push(String(error)); throw error; }
      finally { pending--; }
    };
    for (const name of ["createRenderPipelineAsync", "createComputePipelineAsync"] as const) {
      const create = GPUDevice.prototype[name];
      (GPUDevice.prototype as any)[name] = async function (this: any, ...args: any[]) {
        pending++;
        try { return await (create as any).apply(this, args); }
        catch (error) { errors.push(String(error)); throw error; }
        finally { pending--; }
      };
    }
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (this: any, ...args: any[]) { submissions++; return submit.apply(this, args); };
  }
  const animationOrigins = new WeakMap<Animation, number>();
  const videoOrigins = new WeakMap<HTMLVideoElement, number>();
  host.__slidesRenderClock = {
    running: false,
    get now() { return now; },
    get status() { return { pending, submissions, errors, canvases: document.querySelectorAll("canvas").length }; },
    async tick(timestamp: number) {
      if (timestamp < now) throw new Error("Render clock cannot run backwards");
      now = timestamp;
      for (const [key, item] of [...timers]) if (item.at <= now) {
        timers.delete(key);
        if (item.interval) timers.set(key, { ...item, at: now + item.interval });
        item.callback();
      }
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(now);
      await wait();
      for (const animation of document.getAnimations()) {
        if (!animationOrigins.has(animation)) animationOrigins.set(animation, now);
        animation.pause(); animation.currentTime = now - animationOrigins.get(animation)!;
      }
      for (const video of document.querySelectorAll("video")) {
        video.pause();
        if (video.dataset.slidesPlaying === "false") { videoOrigins.delete(video); continue; }
        if (!videoOrigins.has(video)) videoOrigins.set(video, now);
        if (Number.isFinite(video.duration) && video.duration > 0) {
          const seconds = (now - videoOrigins.get(video)!) / 1000;
          const target = video.loop ? seconds % video.duration : Math.min(seconds, Math.max(0, video.duration - 0.001));
          if (Math.abs(video.currentTime - target) > 0.0001) await new Promise<void>((resolve, reject) => {
            const done = () => { video.removeEventListener("error", failed); resolve(); };
            const failed = () => { video.removeEventListener("seeked", done); reject(new Error("Video seek failed")); };
            video.addEventListener("seeked", done, { once: true });
            video.addEventListener("error", failed, { once: true });
            video.currentTime = target;
          });
        }
      }
      await Promise.all([...queues].map(queue => queue.onSubmittedWorkDone()));
      await wait();
      if (errors.length) throw new Error(errors.join("\n"));
    },
  };
}
