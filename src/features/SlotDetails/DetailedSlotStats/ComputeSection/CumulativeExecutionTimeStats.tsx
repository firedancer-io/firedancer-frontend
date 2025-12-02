import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useMemo } from "react";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import PctBar from "../PctBar";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import styles from "../detailedSlotStats.module.css";
import clsx from "clsx";
import MonoText from "../../../../components/MonoText";
import { gridGapX, gridGapY } from "../consts";
import {
  getTxnBundleStats,
  getTxnStateDurations,
} from "../../../../transactionUtils";
import { clientAtom } from "../../../../atoms";

const initDurations = {
  preLoading: 0,
  validating: 0,
  loading: 0,
  execute: 0,
  postExecute: 0,
  total: 0,
};

function getTotal(durations: typeof initDurations) {
  return Object.values(durations).reduce((acc, val) => acc + val, 0);
}

export default function CumulativeExecutionTimeStats() {
  const client = useAtomValue(clientAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;

  const durations = useMemo(() => {
    if (!transactions) return;

    const unlanded = { ...initDurations };
    const landedSuccess = { ...initDurations };
    const landedFailed = { ...initDurations };

    for (let i = 0; i < transactions.txn_landed.length; i++) {
      const bundleStats = getTxnBundleStats(transactions, i);
      const duration = getTxnStateDurations(
        transactions,
        i,
        bundleStats.bundleTxnIdx,
        client,
      );

      const sumDurations = (
        durations: typeof initDurations,
        b: typeof duration,
      ) => {
        durations.preLoading += Number(b.preLoading);
        durations.validating += Number(b.validating);
        durations.loading += Number(b.loading);
        durations.execute += Number(b.execute);
        durations.postExecute += Number(b.postExecute);
      };
      if (!transactions.txn_landed[i]) {
        sumDurations(unlanded, duration);
      } else if (transactions.txn_error_code[i] === 0) {
        sumDurations(landedSuccess, duration);
      } else {
        sumDurations(landedFailed, duration);
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
  }, [transactions, client]);

  if (!durations) return;

  const { unlanded, landedSuccess, landedFailed, max } = durations;

  return (
    <SlotDetailsSubSection title="Cumulative Execution Time">
      <Grid columns="repeat(7, auto)" gapX={gridGapX} gapY={gridGapY}>
        <div />
        <Text className={styles.tableHeader} style={{ gridColumn: "span 2" }}>
          Success+Landed
        </Text>
        <Text className={styles.tableHeader} style={{ gridColumn: "span 2" }}>
          Failed+Landed
        </Text>
        <Text className={styles.tableHeader} style={{ gridColumn: "span 2" }}>
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
    </SlotDetailsSubSection>
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
  const landedSuccessColor = isTotal ? "#28684A" : "#174933";
  const landedFailedColor = isTotal ? "#8C333A" : "#611623";
  const unlandedColor = isTotal ? "#12677E" : "#004558";

  const landedSuccessUnits = getDurationWithUnits(landedSuccess);
  const landedFailedUnits = getDurationWithUnits(landedFailed);
  const unlandedUnits = getDurationWithUnits(unlanded);

  return (
    <>
      <Text className={clsx(styles.tableRowLabel, isTotal && styles.total)}>
        {label}
      </Text>
      <Text
        className={clsx(styles.tableCellValue, isTotal && styles.total)}
        align="right"
      >
        {landedSuccessUnits.value}
        <MonoText>{landedSuccessUnits.unit}</MonoText>
      </Text>
      <PctBar
        value={landedSuccess}
        total={max}
        valueColor={landedSuccessColor}
      />
      <Text
        className={clsx(styles.tableCellValue, isTotal && styles.total)}
        align="right"
      >
        {landedFailedUnits.value}
        <MonoText>{landedFailedUnits.unit}</MonoText>
      </Text>
      <PctBar value={landedFailed} total={max} valueColor={landedFailedColor} />
      <Text
        className={clsx(styles.tableCellValue, isTotal && styles.total)}
        align="right"
      >
        {unlandedUnits.value}
        <MonoText>{unlandedUnits.unit}</MonoText>
      </Text>
      <PctBar value={unlanded} total={max} valueColor={unlandedColor} />
    </>
  );
}
