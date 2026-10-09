// Install in the browser console, then await runSlidesAudit({ start: 0, count: 8 }).
// Keep the tab visible (or recording) so the browser does not throttle frames.
window.runSlidesAudit = async ({ start = 0, count = 8, repeat = 1, indices } = {}) => {
  const player = window.__legendSlides;
  const audit = window.__slidesAudit ??= {
    environment: { url: location.href, userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visibility: document.visibilityState },
    runs: [],
  };
  const surfaceIds = new WeakMap();
  let nextId = 0;
  let flushes = [];
  const originalFlush = CanvasKit.Surface.prototype.flush;
  CanvasKit.Surface.prototype.flush = function (...args) {
    if (!surfaceIds.has(this)) surfaceIds.set(this, ++nextId);
    flushes.push({ id: surfaceIds.get(this), time: performance.now() });
    return originalFlush.apply(this, args);
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function measure(ms) {
    return new Promise(resolve => {
      const ticks = [], start = performance.now();
      function tick(now) {
        ticks.push(now);
        if (now - start < ms) requestAnimationFrame(tick);
        else resolve({ ticks, elapsed: now - start });
      }
      requestAnimationFrame(tick);
    });
  }
  try {
    const states = player.getState().slides.flatMap((slide, index) =>
      Array.from({ length: slide.metadata.steps ?? 1 }, (_, step) => ({ slide: index, step })));
    for (const { slide, step } of indices ? indices.map(index => states[index]) : states.slice(start, start + count)) {
          player.goTo(slide, step);
          await sleep(150);
          flushes = [];
          const sample = await measure(1200);
          const intervals = sample.ticks.slice(1).map((time, index) => time - sample.ticks[index]);
          const sorted = [...intervals].sort((a, b) => a - b);
          const surfaces = [...new Set(flushes.map(frame => frame.id))].map(id => {
            const frames = flushes.filter(frame => frame.id === id);
            return { id, frames: frames.length, fps: frames.length * 1000 / sample.elapsed };
          });
          audit.runs.push({ repeat, slide: slide + 1, step: step + 1, elapsed: sample.elapsed,
            fps: intervals.length * 1000 / (sample.ticks.at(-1) - sample.ticks[0]),
            p95: sorted[Math.floor(sorted.length * .95)], missedIntervals: intervals.filter(ms => ms > 25).length,
            intervals, surfaces, errors: [...player.errors], runtimeErrors: player.getState().runtimeErrors,
            videos: [...document.querySelectorAll("video")].map(video => ({ src: video.currentSrc, readyState: video.readyState, paused: video.paused, time: video.currentTime, error: video.error?.message })),
          });
    }
    return audit.runs.slice(-(indices?.length ?? count)).map(({ intervals, ...run }) => run);
  } catch (error) {
    audit.error = String(error);
  } finally {
    CanvasKit.Surface.prototype.flush = originalFlush;
  }
};
