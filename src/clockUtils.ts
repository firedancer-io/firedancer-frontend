type Sub = (now: number, dt: number) => void;

export function clockSub(_intervalMs: number) {
  const subs = new Set<Sub>();
  let id: number | null = null;
  let last = performance.now();
  let intervalMs = _intervalMs;

  function startChartClock(newIntervalMs?: number) {
    if (id == null) {
      stopChartClock();
    }
    if (newIntervalMs !== undefined) {
      stopChartClock();
      intervalMs = newIntervalMs;
    }

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
    return () => {
      subs.delete(fn);
    };
  }

  startChartClock();

  return { subscribeClock, stopChartClock, startChartClock };
}
