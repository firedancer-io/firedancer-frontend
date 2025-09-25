import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useMemo } from "react";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import {
  stateTextColors,
  TxnState,
} from "../../../Overview/SlotPerformance/TransactionBarsCard/consts";

export default function TxnStageTimings() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);
  const transactions = query.response?.transactions;

  const durations = useMemo(() => {
    if (!transactions) return;

    let preLoading = 0n;
    let validating = 0n;
    let loading = 0n;
    let execute = 0n;
    let postExecute = 0n;

    for (
      let i = 0;
      i < transactions.txn_mb_start_timestamps_nanos.length;
      i++
    ) {
      let startTs = transactions.txn_mb_start_timestamps_nanos[i];
      let endTs = transactions.txn_mb_end_timestamps_nanos[i];
      let bundleTotal = null;

      // TODO: fix for bundles
      // if (transactions.txn_from_bundle[i] && bundleTxnIdx?.length) {
      //   const bundleIdx = bundleTxnIdx.indexOf(txnIdx) ?? -1;
      //   const prevTxnIdx = bundleTxnIdx[bundleIdx - 1];
      //   if (prevTxnIdx > 0) {
      //     startTs = transactions.txn_preload_end_timestamps_nanos[i];
      //   }

      //   const nextTxnIdx = bundleTxnIdx[bundleIdx + 1];
      //   if (nextTxnIdx > 0) {
      //     endTs = transactions.txn_preload_end_timestamps_nanos[nextTxnIdx];
      //   }

      //   bundleTotal =
      //     transactions.txn_mb_end_timestamps_nanos[
      //       bundleTxnIdx[bundleTxnIdx.length - 1]
      //     ] - transactions.txn_mb_start_timestamps_nanos[bundleTxnIdx[0]];
      // }

      preLoading += transactions.txn_preload_end_timestamps_nanos[i] - startTs;
      validating +=
        transactions.txn_start_timestamps_nanos[i] -
        transactions.txn_preload_end_timestamps_nanos[i];
      loading +=
        transactions.txn_load_end_timestamps_nanos[i] -
        transactions.txn_start_timestamps_nanos[i];
      execute +=
        transactions.txn_end_timestamps_nanos[i] -
        transactions.txn_load_end_timestamps_nanos[i];
      postExecute += endTs - transactions.txn_end_timestamps_nanos[i];
      //  total = endTs - startTs;
    }
    const count = transactions.txn_mb_start_timestamps_nanos.length;
    const durations = {
      preLoading: Number(preLoading) / count,
      validating: Number(validating) / count,
      loading: Number(loading) / count,
      execute: Number(execute) / count,
      postExecute: Number(postExecute) / count,
    };

    const total =
      durations.preLoading +
      durations.validating +
      durations.loading +
      durations.execute +
      durations.postExecute;

    return { ...durations, total };
  }, [transactions]);

  const durationRatios = useMemo(() => {
    if (!durations) return;

    const preLoading = Math.max(
      0,
      (Number(durations.preLoading) / durations.total) * 100,
    );
    const validating = Math.max(
      0,
      (Number(durations.validating) / durations.total) * 100,
    );
    const loading = Math.max(
      0,
      (Number(durations.loading) / durations.total) * 100,
    );
    const execute = Math.max(
      0,
      (Number(durations.execute) / durations.total) * 100,
    );
    const postExecute = Math.max(
      0,
      (Number(durations.postExecute) / durations.total) * 100,
    );

    return { preLoading, validating, loading, execute, postExecute };
  }, [durations]);

  const durationUnits = useMemo(() => {
    if (!durations) return;

    const preLoading = getDurationWithUnits(durations.preLoading);
    const validating = getDurationWithUnits(durations.validating);
    const loading = getDurationWithUnits(durations.loading);
    const execute = getDurationWithUnits(durations.execute);
    const postExecute = getDurationWithUnits(durations.postExecute);

    return {
      preLoading,
      validating,
      loading,
      execute,
      postExecute,
    };
  }, [durations]);

  if (!durationUnits || !durationRatios) return;

  return (
    <>
      <Text style={{ color: "var(--gray-12)" }}>Avg Txn Stage Durations</Text>
      <Text style={{ color: "var(--gray-11)", marginTop: "-8px" }} size="1">
        (not including bundles yet)
      </Text>
      <Grid columns="repeat(2, auto) minmax(60px, 135px)" gapX="3" gapY="1">
        <Row
          label={TxnState.PRELOADING}
          value={durationUnits.preLoading}
          color={stateTextColors[TxnState.PRELOADING]}
          x={0}
          width={durationRatios.preLoading}
        />
        <Row
          label={TxnState.VALIDATE}
          value={durationUnits.validating}
          color={stateTextColors[TxnState.VALIDATE]}
          x={durationRatios.preLoading}
          width={durationRatios.validating}
        />
        <Row
          label={TxnState.LOADING}
          value={durationUnits.loading}
          color={stateTextColors[TxnState.LOADING]}
          x={durationRatios.preLoading + durationRatios.validating}
          width={durationRatios.loading}
        />
        <Row
          label={TxnState.EXECUTE}
          value={durationUnits.execute}
          color={stateTextColors[TxnState.EXECUTE]}
          x={
            durationRatios.preLoading +
            durationRatios.validating +
            durationRatios.loading
          }
          width={durationRatios.execute}
        />
        <Row
          label={TxnState.POST_EXECUTE}
          value={durationUnits.postExecute}
          color={stateTextColors[TxnState.POST_EXECUTE]}
          x={
            durationRatios.preLoading +
            durationRatios.validating +
            durationRatios.loading +
            durationRatios.execute
          }
          width={durationRatios.postExecute}
        />
      </Grid>
    </>
  );
}

interface RowProps {
  label: string;
  value: ReturnType<typeof getDurationWithUnits>;
  x: number;
  width: number;
  color: string;
}

const rectPct = 80;

function Row({ label, value, x, width, color }: RowProps) {
  return (
    <>
      <Text wrap="nowrap" style={{ color }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color }} align="right">
        {value.value} {value.unit}
      </Text>
      <svg
        height="17px"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center", width: "100%" }}
      >
        <rect
          height={`${rectPct}%`}
          y={`${(100 - rectPct) / 2}%`}
          x={`${Math.trunc(x)}%`}
          width={`${Math.max(1, width)}%`}
          opacity={0.6}
          fill={color}
        />
      </svg>
    </>
  );
}
