import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import {
  useSlotQueryResponseTransactions,
} from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useMemo } from "react";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import type { SlotTransactions } from "../../../../api/types";
import PctBar from "../PctBar";

const initDurations = {
  preLoading: 0,
  validating: 0,
  loading: 0,
  execute: 0,
  postExecute: 0,
  total: 0,
};

function sumDurations(
  transactions: SlotTransactions,
  i: number,
  durations: typeof initDurations,
) {
  const startTs = transactions.txn_mb_start_timestamps_nanos[i];
  const endTs = transactions.txn_mb_end_timestamps_nanos[i];

  // todo: bundles
  durations.preLoading += Number(
    transactions.txn_preload_end_timestamps_nanos[i] - startTs,
  );
  durations.validating += Number(
    transactions.txn_start_timestamps_nanos[i] -
      transactions.txn_preload_end_timestamps_nanos[i],
  );
  durations.loading += Number(
    transactions.txn_load_end_timestamps_nanos[i] -
      transactions.txn_start_timestamps_nanos[i],
  );
  durations.execute += Number(
    transactions.txn_end_timestamps_nanos[i] -
      transactions.txn_load_end_timestamps_nanos[i],
  );
  durations.postExecute += Number(
    endTs - transactions.txn_end_timestamps_nanos[i],
  );

  return durations;
}

function getTotal(durations: typeof initDurations) {
  return Object.values(durations).reduce((acc, val) => acc + val, 0);
}

export default function CumulativeExecutionTimeStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;

  const durations = useMemo(() => {
    if (!transactions) return;

    const unlanded = { ...initDurations };
    const landedSuccess = { ...initDurations };
    const landedFailed = { ...initDurations };

    for (let i = 0; i < transactions.txn_landed.length; i++) {
      if (!transactions.txn_landed[i]) {
        sumDurations(transactions, i, unlanded);
      } else if (transactions.txn_error_code[i] === 0) {
        sumDurations(transactions, i, landedSuccess);
      } else {
        sumDurations(transactions, i, landedFailed);
      }
    }

    unlanded.total = getTotal(unlanded);
    landedSuccess.total = getTotal(landedSuccess);
    landedFailed.total = getTotal(landedFailed);

    return {
      unlanded,
      landedSuccess,
      landedFailed,
      max: Math.max(unlanded.total, landedSuccess.total, landedFailed.total),
    };
  }, [transactions]);

  if (!durations) return;

  const { unlanded, landedSuccess, landedFailed, max } = durations;

  return (
    <div>
      <Text style={{ color: "var(--gray-12)" }}>Cumulative Execution Time</Text>
      <Grid
        columns="repeat(7, auto)"
        gapX="2"
        gapY="1"
      >
        <div></div>
        <Text style={{ color: "var(--gray-11)", gridColumn: "span 2" }}>
          Success+Landed
        </Text>
        <Text style={{ color: "var(--gray-11)", gridColumn: "span 2" }}>
          Failed+Landed
        </Text>
        <Text style={{ color: "var(--gray-11)", gridColumn: "span 2" }}>
          Unlanded
        </Text>
        <Row
          label="Preloading"
          landedSuccess={landedSuccess.preLoading}
          landedFailed={landedFailed.preLoading}
          unlanded={unlanded.preLoading}
          max={max}
        />
        <Row
          label="Validating"
          landedSuccess={landedSuccess.validating}
          landedFailed={landedFailed.validating}
          unlanded={unlanded.validating}
          max={max}
        />
        <Row
          label="Loading"
          landedSuccess={landedSuccess.loading}
          landedFailed={landedFailed.loading}
          unlanded={unlanded.loading}
          max={max}
        />
        <Row
          label="Execute"
          landedSuccess={landedSuccess.execute}
          landedFailed={landedFailed.execute}
          unlanded={unlanded.execute}
          max={max}
        />
        <Row
          label="Post-Execute"
          landedSuccess={landedSuccess.postExecute}
          landedFailed={landedFailed.postExecute}
          unlanded={unlanded.postExecute}
          max={max}
        />
        <Row
          label="Total"
          landedSuccess={landedSuccess.total}
          landedFailed={landedFailed.total}
          unlanded={unlanded.total}
          max={max}
          isTotal
        />
      </Grid>
    </div>
  );
}

interface RowProps {
  label: string;
  landedSuccess: number;
  landedFailed: number;
  unlanded: number;
  max: number;
  isTotal?: boolean;
}

function Row({
  label,
  landedSuccess,
  landedFailed,
  unlanded,
  max,
  isTotal,
}: RowProps) {
  const labelColor = isTotal ? "var(--gray-12)" : "var(--gray-11)";
  const valueColor = isTotal ? "var(--gray-11)" : "var(--gray-10)";
  const landedSuccessColor = isTotal ? "#28684A" : "#174933";
  const landedFailedColor = isTotal ? "#8C333A" : "#611623";
  const unlandedColor = isTotal ? "#12677E" : "#004558";

  const landedSuccessUnits = getDurationWithUnits(landedSuccess);
  const landedFailedUnits = getDurationWithUnits(landedFailed);
  const unlandedUnits = getDurationWithUnits(unlanded);

  return (
    <>
      <Text wrap="nowrap" style={{ color: labelColor }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color: valueColor }} align="right">
        {`${landedSuccessUnits.value} ${landedSuccessUnits.unit}`}
      </Text>
      <PctBar
        value={landedSuccess}
        total={max}
        valueColor={landedSuccessColor}
      />
      <Text wrap="nowrap" style={{ color: valueColor }} align="right">
        {`${landedFailedUnits.value} ${landedFailedUnits.unit}`}
      </Text>
      <PctBar value={landedFailed} total={max} valueColor={landedFailedColor} />
      <Text wrap="nowrap" style={{ color: valueColor }} align="right">
        {`${unlandedUnits.value} ${unlandedUnits.unit}`}
      </Text>
      <PctBar value={unlanded} total={max} valueColor={unlandedColor} />
    </>
  );
}
