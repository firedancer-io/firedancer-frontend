import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { estimatedTpsAtom, tpsHistoryAtom } from "../../../api/atoms";
import { tpsSampleIntervalMs } from "../../../api/consts";
import { useEffect, useRef } from "react";
import { tpsDataAtom } from "./atoms";
import { WINDOW_MS } from "./consts";

const store = getDefaultStore();
const MAX_HISTORY_POINTS = Math.ceil(WINDOW_MS / tpsSampleIntervalMs);

export default function useUpdateTransactions() {
  const tpsHistory = useAtomValue(tpsHistoryAtom);
  const setTpsData = useSetAtom(tpsDataAtom);

  useEffect(() => {
    if (!tpsHistory) return;

    const now = performance.now();

    const timestampedHistory = tpsHistory
      .slice(-MAX_HISTORY_POINTS)
      .map(([total, vote, nonvote_success, nonvote_failed], i, arr) => ({
        ts: now - (arr.length - 1 - i) * tpsSampleIntervalMs,
        tps: { total, vote, nonvote_success, nonvote_failed },
      }));

    setTpsData(timestampedHistory);
  }, [setTpsData, tpsHistory]);

  const pushTpsData = () => {
    const tps = store.get(estimatedTpsAtom);
    if (tps === undefined) return;

    const ts = performance.now();
    setTpsData((draft) => {
      draft.push({ ts, tps });
      const windowStart = ts - WINDOW_MS;
      while (draft.length > 1 && draft[1].ts < windowStart) draft.shift();
    });
  };

  const pushTpsDataRef = useRef(pushTpsData);
  pushTpsDataRef.current = pushTpsData;

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    function tick() {
      pushTpsDataRef.current();
      timeout = setTimeout(tick, tpsSampleIntervalMs);
    }
    tick();
    return () => clearTimeout(timeout);
  }, []);
}
