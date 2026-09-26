const timeouts: Record<string, any> = {};
export function timeoutOnce(name: string, cb: () => void, time: number) {
  const t = timeouts[name];
  if (t) {
    clearTimeout(t);
  }
  timeouts[name] = setTimeout(() => {
    delete timeouts[name];

    cb();
  }, time);
}
