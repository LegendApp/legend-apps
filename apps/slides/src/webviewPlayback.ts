import type { PlaybackPhase } from "@legend-apps/presentation";

/** Event-driven browser lifecycle commands; never a JavaScript animation clock. */
export function webviewPlaybackScript(phase: PlaybackPhase, previewTime: number) {
  const sample = Number.isFinite(previewTime) ? Math.max(0, previewTime) : 1.25;
  return `;(function(phase, previewTime) {
    if (!window.__legendSlidesPlayback) {
      var phaseNow = 'playing', preview = 0, resetOnPlay = false;
      var animations = new Set(), media = new Set(), seenMedia = new WeakSet();
      function forward() {
        for (var i = 0; i < window.frames.length; i++) {
          window.frames[i].postMessage({type:'legend-slides-playback', phase:phaseNow, previewTime:preview}, '*');
        }
      }
      function apply() {
        if (phaseNow !== 'playing') {
          // A paused SPA can replace content; do not retain detached DOM trees.
          animations.forEach(function(animation) {
            if (animation.playState === 'idle' || (animation.effect && animation.effect.target && animation.effect.target.isConnected === false)) animations.delete(animation);
          });
          media.forEach(function(element) { if (element.isConnected === false) media.delete(element); });
          (document.getAnimations ? document.getAnimations() : []).forEach(function(animation) {
            if (animation.playState === 'running' || animation.pending) {
              animations.add(animation); animation.pause();
            }
            if (animations.has(animation) && (phaseNow === 'preview' || phaseNow === 'preparing')) {
              animation.currentTime = phaseNow === 'preview' ? preview * 1000 : 0;
            }
          });
          document.querySelectorAll('video,audio').forEach(function(element) {
            if (!element.paused || (!seenMedia.has(element) && element.autoplay)) media.add(element);
            seenMedia.add(element);
            if (!element.paused) element.pause();
            if (element.readyState > 0 && (phaseNow === 'preview' || phaseNow === 'preparing')) {
              var time = phaseNow === 'preview' ? preview : 0;
              if (Number.isFinite(element.duration)) time = Math.min(time, element.duration);
              try { if (element.currentTime !== time) element.currentTime = time; } catch (_) {}
            }
          });
        }
      }
      function update(next, time) {
        var was = phaseNow;
        phaseNow = next; preview = time;
        if (next === 'playing') observer.disconnect();
        else observer.observe(document, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style','src']});
        if (next === 'preview' || next === 'preparing') resetOnPlay = true;
        if (next === 'playing' && was !== 'playing') {
          animations.forEach(function(animation) {
            if (resetOnPlay) animation.currentTime = 0;
            animation.play();
          });
          media.forEach(function(element) {
            try { if (resetOnPlay) element.currentTime = 0; } catch (_) {}
            var started = element.play();
            if (started && started.catch) started.catch(function() {});
          });
          animations.clear(); media.clear(); resetOnPlay = false;
        }
        apply(); forward();
      }
      window.__legendSlidesPlayback = {update:update};
      // React mounts, stylesheet loads, and newly started media also inherit pause.
      var observer = new MutationObserver(apply);
      document.addEventListener('animationstart', apply, true);
      document.addEventListener('play', apply, true);
      document.addEventListener('loadedmetadata', apply, true);
      document.addEventListener('DOMContentLoaded', apply, true);
      window.addEventListener('load', function() { apply(); forward(); }, true);
      window.addEventListener('message', function(event) {
        var data = event.data;
        if (event.source === window.parent && data && data.type === 'legend-slides-playback' &&
            ['playing','paused','outgoing','preview','preparing'].indexOf(data.phase) >= 0) update(data.phase, data.previewTime);
      });
    }
    window.__legendSlidesPlayback.update(phase, previewTime);
  })(${JSON.stringify(phase)}, ${sample});true;`;
}
