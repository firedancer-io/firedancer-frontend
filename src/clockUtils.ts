type Sub = (now: number, dt: number) => void;

export function createClock(intervalMs: number) {
  const subs = new Set<Sub>();
  let id: number | null = null;
  let last = performance.now();

  function startChartClock() {
    const loop = () => {
      const now = performance.now();
      if (now - last >= intervalMs) {
        const dt = now - last;
        last = now;
        // all subscribers update in the same frame
        subs.forEach((fn) => fn(now, dt));
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
  }

  function stopChartClock() {
    if (id != null) cancelAnimationFrame(id);
    id = null;
  }

  function subscribeClock(fn: Sub) {
    subs.add(fn);
    if (id == null) {
      startChartClock();
    }

    return () => {
      subs.delete(fn);
      if (!subs.size) {
        stopChartClock();
      }
    };
  }

  return { subscribeClock };
}
