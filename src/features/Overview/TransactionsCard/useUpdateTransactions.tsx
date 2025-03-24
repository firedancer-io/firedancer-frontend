import { useAtomValue, useSetAtom } from "jotai";
import { estimatedTpsAtom, tpsHistoryAtom } from "../../../api/atoms";
import { useEffect, useRef } from "react";
import { tpsDataAtom } from "./atoms";
import { EstimatedTps } from "../../../api/types";
import { maxTransactionChartPoints } from "./consts";

export default function useUpdateTransactions() {
  const tpsHistory = useAtomValue(tpsHistoryAtom);
  const tps = useAtomValue(estimatedTpsAtom);
  const setTpsData = useSetAtom(tpsDataAtom);

  useEffect(() => {
    if (!tpsHistory) return;

    const empty: undefined[] = new Array<undefined>(
      maxTransactionChartPoints,
    ).fill(undefined);

    const tps = [
      ...empty,
      ...tpsHistory.flatMap<EstimatedTps>(
        ([total, vote, nonvote_success, nonvote_failed]) => [
          {
            total,
            vote,
            nonvote_success,
            nonvote_failed,
          },
          {
            total,
            vote,
            nonvote_success,
            nonvote_failed,
          },
          {
            total,
            vote,
            nonvote_success,
            nonvote_failed,
          },
          {
            total,
            vote,
            nonvote_success,
            nonvote_failed,
          },
        ],
      ),
    ];
    setTpsData(tps.slice(tps.length - maxTransactionChartPoints));
  }, [setTpsData, tpsHistory]);

  const pushTpsData = () => {
    if (!tpsHistory) return;
    if (tps === undefined) return;

    setTpsData((draft) => {
      draft.push(tps);
      if (draft.length > maxTransactionChartPoints) draft.shift();
    });
  };

  const pushTpsDataRef = useRef(pushTpsData);
  pushTpsDataRef.current = pushTpsData;

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    function tick() {
      pushTpsDataRef.current();
      timeout = setTimeout(tick, 100);
    }
    tick();
    return () => clearTimeout(timeout);
  }, []);
}
