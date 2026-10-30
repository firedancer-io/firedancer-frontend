import { atom, getDefaultStore } from "jotai";
import { nsPerMs } from "./consts";
import { createRingBuffer } from "./ringBuffer";
import { msToNs } from "./numUtils";
import { epochNow } from "./clockUtils";
import { serverTimeNanosAtom } from "./api/atoms";

/**
 * Get timestamp for "now", which is adjusted using an avg diff of server time and real now ts to smooth out server msg delays.
 */
export const smoothedNowNsAtom = (function () {
  const bufferSize = 100;
  const updateIntervalMs = 10;
  const ringBuffer = createRingBuffer<number>(bufferSize);

  const _smoothedNowNsAtom = atom<bigint | undefined>();

  let lastRafTime = -Infinity;
  let prevTotal = 0;

  const refreshNowAtom = atom(null, (get, set) => {
    const serverTimeNs = get(serverTimeNanosAtom);
    if (serverTimeNs == null) return;

    const nowMs = epochNow();
    // ns timestamp overflows number so use bigint
    const nowNs = msToNs(nowMs);
    const timeDiffNs = Number(nowNs - serverTimeNs);
    const evicted = ringBuffer.push(timeDiffNs);

    const total = prevTotal + timeDiffNs - (evicted ?? 0);
    prevTotal = total;
    const avgTimeDiffNs = Math.round(total / ringBuffer.length);

    const smoothedNowNs = nowNs - BigInt(avgTimeDiffNs);
    set(_smoothedNowNsAtom, smoothedNowNs);
  });
  const store = getDefaultStore();

  function loop() {
    requestAnimationFrame(function updateSmoothedNow(rafTime: number) {
      if (rafTime - lastRafTime >= updateIntervalMs) {
        store.set(refreshNowAtom);
        lastRafTime = rafTime;
      }
      loop();
    });
  }

  loop();

  return atom((get) => get(_smoothedNowNsAtom));
})();

export const smoothedNowMsAtom = atom((get) => {
  const nowNs = get(smoothedNowNsAtom);
  if (nowNs == null) return;
  return Number(nowNs / BigInt(nsPerMs));
});
