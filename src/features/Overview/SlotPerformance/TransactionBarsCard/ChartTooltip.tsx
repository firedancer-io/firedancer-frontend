import { useAtomValue } from "jotai";
import styles from "./chartTooltip.module.css";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import { SlotTransactions } from "../../../../api/types";
import { Flex, Separator, Text } from "@radix-ui/themes";
import { errorCodeMap, stateTextColors, TxnState } from "./consts";
import { CSSProperties, useMemo } from "react";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";
import { chartFiltersAtom } from "./atoms";

export default function ChartTooltip() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);
  const txnIdx = useAtomValue(tooltipTxnIdxAtom);
  const txnState = useAtomValue(tooltipTxnStateAtom);
  const transactions = query.response?.transactions;

  const bundleStats = useMemo(() => {
    if (!transactions) return;
    if (txnIdx < 0) return;
    if (!transactions.txn_from_bundle[txnIdx]) return;

    const mbId = transactions.txn_microblock_id[txnIdx];
    const bundleTxnIdx: number[] = [];

    for (let i = 0; i < transactions.txn_microblock_id.length; i++) {
      if (transactions.txn_microblock_id[i] !== mbId) continue;
      bundleTxnIdx.push(i);
    }

    bundleTxnIdx.sort((a, b) => {
      const diff =
        transactions.txn_start_timestamps_nanos[a] -
        transactions.txn_start_timestamps_nanos[b];
      if (diff > 0) return 1;
      if (diff < 0) return -1;
      return 0;
    });

    return {
      totalCount: bundleTxnIdx.length,
      order: bundleTxnIdx.indexOf(txnIdx) + 1,
      bundleTxnIdx,
    };
  }, [transactions, txnIdx]);

  return (
    <div id="uplot-tooltip">
      {txnIdx > -1 && transactions && (
        <Flex direction="column">
          <Text
            className={styles.state}
            style={{ color: stateTextColors[txnState] }}
          >
            {txnState}
          </Text>
          <RowSeparator />
          <Flex direction="column">
            <SuccessErrorDisplay txnIdx={txnIdx} transactions={transactions} />
            <BooleanLabelValueDisplay
              label="Bundle"
              value={transactions.txn_from_bundle[txnIdx]}
              append={
                bundleStats
                  ? `(${bundleStats.order} of ${bundleStats.totalCount})`
                  : undefined
              }
            />
            <BooleanLabelValueDisplay
              label="Vote"
              value={transactions.txn_is_simple_vote[txnIdx]}
            />
            <BooleanLabelValueDisplay
              label="Landed"
              value={transactions.txn_landed[txnIdx]}
            />
            <RowSeparator />
            <LabelValueDisplay
              label="Fees"
              value={`${transactions.txn_priority_fee[txnIdx]?.toLocaleString()}`}
              color="#4CCCE6"
            />
            <LabelValueDisplay
              label="Tips"
              value={`${transactions.txn_tips[txnIdx]?.toLocaleString()}`}
              color="#1FD8A4"
            />
            <RowSeparator />
            <LabelValueDisplay
              label="CU Requested"
              value={`${transactions.txn_compute_units_requested[txnIdx]?.toLocaleString()}`}
              color="#FF8DCC"
            />
            <LabelValueDisplay
              label="CU Consumed"
              value={`${transactions.txn_compute_units_consumed[txnIdx]?.toLocaleString()}`}
              color="#D19DFF"
            />
            <LabelValueDisplay
              label="CU Max"
              value={`${transactions.txn_max_compute_units[txnIdx]?.toLocaleString()}`}
            />
            <IncomeDisplay transactions={transactions} txnIdx={txnIdx} />
            <RowSeparator />
            <LabelValueDisplay label="Txn Index" value={`${txnIdx}`} />
            <LabelValueDisplay
              label="Microblock ID"
              value={`${transactions.txn_microblock_id[txnIdx]}`}
            />
            <LabelValueDisplay
              label="Bank ID"
              value={`${transactions.txn_bank_idx[txnIdx]}`}
            />
            <StateDurationDisplay
              transactions={transactions}
              txnIdx={txnIdx}
              bundleTxnIdx={bundleStats?.bundleTxnIdx}
            />
          </Flex>
        </Flex>
      )}
    </div>
  );
}

interface IncomeDisplayProps {
  transactions: SlotTransactions;
  txnIdx: number;
}

function IncomeDisplay({ transactions, txnIdx }: IncomeDisplayProps) {
  const filters = useAtomValue(chartFiltersAtom);

  const incomeRank = useMemo(() => {
    const cuIncome = transactions.txn_priority_fee.reduce<
      { txnIdx: number; income: number }[]
    >((incomeTxnId, _, txnIdx) => {
      if (
        Object.values(filters).some(
          (func) => transactions && !func(transactions, txnIdx),
        )
      )
        return incomeTxnId;

      if (!transactions?.txn_compute_units_consumed[txnIdx]) return incomeTxnId;

      if (
        !(
          (transactions?.txn_priority_fee[txnIdx] ?? 0n) +
          (transactions?.txn_tips[txnIdx] ?? 0n)
        )
      )
        return incomeTxnId;

      const income =
        Number(
          (transactions?.txn_priority_fee[txnIdx] ?? 0n) +
            (transactions?.txn_tips[txnIdx] ?? 0n),
        ) / (transactions?.txn_compute_units_consumed[txnIdx] ?? 0);

      incomeTxnId.push({
        txnIdx,
        income,
      });

      return incomeTxnId;
    }, []);

    cuIncome.sort((a, b) => b.income - a.income);

    return cuIncome.reduce<Record<number, number>>(
      (incomeMap, { txnIdx }, rank) => {
        incomeMap[txnIdx] = rank + 1;
        return incomeMap;
      },
      {},
    );
  }, [filters, transactions]);

  const totalRanks = Object.keys(incomeRank).length;
  const rankText = incomeRank[txnIdx]
    ? ` (${incomeRank[txnIdx]} of ${totalRanks})`
    : "";

  return (
    <LabelValueDisplay
      label="CU Income"
      value={`${(
        Number(
          transactions.txn_priority_fee[txnIdx] + transactions.txn_tips[txnIdx],
        ) / transactions.txn_compute_units_consumed[txnIdx]
      )?.toLocaleString()}${rankText}`}
      color="#9EB1FF"
    />
  );
}

function getDurationUnits(value: bigint) {
  let formatted = Number(value);

  if (formatted < 1_000) {
    return { value: Math.round(formatted), unit: "ns" };
  }

  formatted /= 1_000;
  if (formatted < 1_000) {
    return { value: Math.round(formatted), unit: "µs" };
  }

  formatted /= 1_000;
  return { value: Math.round(formatted), unit: "ms" };
}

interface StateDurationDisplayProps {
  transactions: SlotTransactions;
  txnIdx: number;
  bundleTxnIdx?: number[];
}

function StateDurationDisplay({
  transactions,
  txnIdx,
  bundleTxnIdx,
}: StateDurationDisplayProps) {
  const durations = useMemo(() => {
    if (txnIdx < 0) return;

    let startTs = transactions.txn_mb_start_timestamps_nanos[txnIdx];
    let endTs = transactions.txn_mb_end_timestamps_nanos[txnIdx];
    let bundleTotal = null;

    if (transactions.txn_from_bundle[txnIdx] && bundleTxnIdx?.length) {
      const bundleIdx = bundleTxnIdx.indexOf(txnIdx) ?? -1;
      const prevTxnIdx = bundleTxnIdx[bundleIdx - 1];
      if (prevTxnIdx > 0) {
        startTs = transactions.txn_end_timestamps_nanos[prevTxnIdx];
      }

      const nextTxnIdx = bundleTxnIdx[bundleIdx + 1];
      if (nextTxnIdx > 0) {
        endTs = transactions.txn_start_timestamps_nanos[nextTxnIdx];
      }

      bundleTotal =
        transactions.txn_mb_end_timestamps_nanos[
          bundleTxnIdx[bundleTxnIdx.length - 1]
        ] - transactions.txn_mb_start_timestamps_nanos[bundleTxnIdx[0]];
    }

    const preLoading =
      transactions.txn_start_timestamps_nanos[txnIdx] - startTs;
    const loading =
      transactions.txn_load_end_timestamps_nanos[txnIdx] -
      transactions.txn_start_timestamps_nanos[txnIdx];
    const execute =
      transactions.txn_end_timestamps_nanos[txnIdx] -
      transactions.txn_load_end_timestamps_nanos[txnIdx];
    const postExecute = endTs - transactions.txn_end_timestamps_nanos[txnIdx];
    const total = endTs - startTs;

    return { preLoading, loading, execute, postExecute, total, bundleTotal };
  }, [bundleTxnIdx, transactions, txnIdx]);

  const durationRatios = useMemo(() => {
    if (!durations) return;

    const total = Number(durations.total);
    const preLoading = (Number(durations.preLoading) / total) * 100;
    const loading = (Number(durations.loading) / total) * 100;
    const execute = (Number(durations.execute) / total) * 100;
    const postExecute = (Number(durations.postExecute) / total) * 100;

    return { preLoading, loading, execute, postExecute };
  }, [durations]);

  const durationUnits = useMemo(() => {
    if (!durations) return;

    const preLoading = getDurationUnits(durations.preLoading);
    const loading = getDurationUnits(durations.loading);
    const execute = getDurationUnits(durations.execute);
    const postExecute = getDurationUnits(durations.postExecute);
    const total = getDurationUnits(durations.total);
    const bundleTotal =
      durations.bundleTotal != null && getDurationUnits(durations.bundleTotal);

    return { preLoading, loading, execute, postExecute, total, bundleTotal };
  }, [durations]);

  if (!durations || !durationRatios || !durationUnits) return;

  return (
    <>
      <RowSeparator />
      <Flex>
        <svg height="36" className={styles.durationContainer}>
          <rect
            height="8"
            width={`${durationRatios.preLoading}%`}
            fill={stateTextColors[TxnState.PRELOADING]}
          />
          <rect
            height="8"
            width={`${durationRatios.loading}%`}
            fill={stateTextColors[TxnState.LOADING]}
            x={`${durationRatios.preLoading}%`}
            y="25%"
          />
          <rect
            height="8"
            width={`${durationRatios.execute}%`}
            fill={stateTextColors[TxnState.EXECUTE]}
            x={`${durationRatios.preLoading + durationRatios.loading}%`}
            y="50%"
          />
          <rect
            height="8"
            width={`${durationRatios.postExecute}%`}
            fill={stateTextColors[TxnState.POST_EXECUTE]}
            x={`${durationRatios.preLoading + durationRatios.loading + durationRatios.execute}%`}
            y="75%"
          />
        </svg>
      </Flex>
      <LabelValueDisplay
        label={TxnState.PRELOADING}
        color={stateTextColors[TxnState.PRELOADING]}
        value={durationUnits.preLoading.value}
        unit={durationUnits.preLoading.unit}
      />
      <LabelValueDisplay
        label={TxnState.LOADING}
        color={stateTextColors[TxnState.LOADING]}
        value={durationUnits.loading.value}
        unit={durationUnits.loading.unit}
      />
      <LabelValueDisplay
        label={TxnState.EXECUTE}
        color={stateTextColors[TxnState.EXECUTE]}
        value={durationUnits.execute.value}
        unit={durationUnits.execute.unit}
      />
      <LabelValueDisplay
        label={TxnState.POST_EXECUTE}
        color={stateTextColors[TxnState.POST_EXECUTE]}
        value={durationUnits.postExecute.value}
        unit={durationUnits.postExecute.unit}
      />
      <LabelValueDisplay
        label="Total"
        value={durationUnits.total.value}
        unit={durationUnits.total.unit}
      />
      {durations.bundleTotal && durationUnits.bundleTotal && (
        <LabelValueDisplay
          label="Total (Bundle)"
          value={durationUnits.bundleTotal.value}
          unit={durationUnits.bundleTotal.unit}
        />
      )}
    </>
  );
}

interface SuccessErrorDisplayProps {
  txnIdx: number;
  transactions: SlotTransactions;
}

function SuccessErrorDisplay({
  txnIdx,
  transactions,
}: SuccessErrorDisplayProps) {
  const errorCode = transactions.txn_error_code[txnIdx];
  const isError = errorCode !== 0;

  return (
    <LabelValueDisplay
      label={isError ? "Error" : "Success"}
      value={isError ? `${errorCodeMap[errorCode]}` : "Yes"}
      color={isError ? "#E5484D" : "#30A46C"}
    />
  );
}

interface LabelValueDisplayProps {
  label: string;
  value: string | number;
  color?: string;
  unit?: string;
}

function LabelValueDisplay({
  label,
  value,
  color,
  unit,
}: LabelValueDisplayProps) {
  const formattedValue =
    typeof value === "number" ? value.toLocaleString() : value;

  return (
    <Flex
      justify="between"
      gap="4"
      style={
        {
          "--color-override": color,
        } as CSSProperties
      }
    >
      <Text>{label}</Text>
      <span>
        <Text>{formattedValue}</Text>
        {unit && <Text className={styles.unit}>{unit}</Text>}
      </span>
    </Flex>
  );
}

function BooleanLabelValueDisplay({
  value,
  append,
  ...props
}: Omit<LabelValueDisplayProps, "value"> & {
  value: boolean;
  append?: string;
}) {
  let formattedValue = value ? "Yes" : "No";
  if (append) {
    formattedValue += ` ${append}`;
  }
  return <LabelValueDisplay {...props} value={formattedValue} />;
}

function RowSeparator() {
  return <Separator size="4" my="1" className={styles.separator} />;
}
