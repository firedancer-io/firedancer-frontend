import { useAtomValue } from "jotai";
import styles from "./chartTooltip.module.css";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import { SlotTransactions } from "../../../../api/types";
import { Button, Flex, Text } from "@radix-ui/themes";
import { errorCodeMap, stateTextColors, TxnState } from "./consts";
import { CSSProperties, useMemo, useState } from "react";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";
import { chartFiltersAtom } from "./atoms";
import UplotTooltip from "../../../../uplotReact/UplotTooltip";
import { calcTxnIncome, getCuIncomeRankings } from "./txnBarsPluginUtils";
import { Cross2Icon, CopyIcon, CheckIcon } from "@radix-ui/react-icons";
import { useDebouncedCallback } from "use-debounce";
import RowSeparator from "../../../../components/RowSeparator";
import { getDurationWithUnits } from "./chartUtils";

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
        transactions.txn_preload_end_timestamps_nanos[a] -
        transactions.txn_preload_end_timestamps_nanos[b];
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
    <UplotTooltip elId="txn-bars-tooltip">
      {transactions?.txn_bank_idx[txnIdx] != null && (
        <Flex direction="column">
          <Flex justify="between">
            <Text
              className={styles.state}
              style={{ color: stateTextColors[txnState] }}
            >
              {txnState}
            </Text>
            <Button variant="ghost" size="1" id="txn-bars-tooltip-close">
              <Cross2Icon color="#777b84" />
            </Button>
          </Flex>
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
              value={`${(transactions.txn_priority_fee[txnIdx] + transactions.txn_transaction_fee[txnIdx])?.toLocaleString()}`}
              color="#4CCCE6"
            />
            <LabelValueDisplay
              label="Tips"
              value={`${transactions.txn_tips[txnIdx]?.toLocaleString()}`}
              color="#1FD8A4"
            />
            <RowSeparator />
            <CuDisplay transactions={transactions} txnIdx={txnIdx} />
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
            <LabelValueDisplay
              label="Age since slot start"
              value={`${(Number(transactions.txn_arrival_timestamps_nanos[txnIdx] - transactions.start_timestamp_nanos) / 1_000_000).toLocaleString()}ms`}
            />
            <StateDurationDisplay
              transactions={transactions}
              txnIdx={txnIdx}
              bundleTxnIdx={bundleStats?.bundleTxnIdx}
            />
            <RowSeparator />
            <LabelValueDisplay
              label="Txn Sig"
              value={`${transactions.txn_signature[txnIdx]?.substring(0, 8)}...`}
              copyValue={transactions.txn_signature[txnIdx]}
            />
          </Flex>
        </Flex>
      )}
    </UplotTooltip>
  );
}

interface IncomeDisplayProps {
  transactions: SlotTransactions;
  txnIdx: number;
}

function IncomeDisplay({ transactions, txnIdx }: IncomeDisplayProps) {
  const filters = useAtomValue(chartFiltersAtom);

  const { rankings, totalRanks } = useMemo(
    () => getCuIncomeRankings(transactions, Object.values(filters)),
    [filters, transactions],
  );

  const rankText = rankings[txnIdx]
    ? ` (${rankings[txnIdx]} of ${totalRanks})`
    : "";

  return (
    <LabelValueDisplay
      label="CU Income"
      value={`${calcTxnIncome(
        transactions,
        txnIdx,
      )?.toLocaleString()}${rankText}`}
      color="#9EB1FF"
    />
  );
}

interface CuDisplayProps {
  transactions: SlotTransactions;
  txnIdx: number;
}

function CuDisplay({ transactions, txnIdx }: CuDisplayProps) {
  const consumedPct = transactions.txn_compute_units_requested[txnIdx]
    ? Math.trunc(
        (transactions.txn_compute_units_consumed[txnIdx] /
          transactions.txn_compute_units_requested[txnIdx]) *
          100,
      )
    : 100;

  return (
    <>
      <LabelValueDisplay
        label="CU Consumed"
        value={`${transactions.txn_compute_units_consumed[txnIdx]?.toLocaleString()}`}
        color="#D19DFF"
      />
      <LabelValueDisplay
        label="CU Requested"
        value={`${transactions.txn_compute_units_requested[txnIdx]?.toLocaleString()}`}
        color="#FF8DCC"
      />
      <IncomeDisplay transactions={transactions} txnIdx={txnIdx} />
      <Flex>
        <svg height="8" fill="none" className={styles.cuBars}>
          <rect
            height="8"
            width={`${consumedPct}%`}
            opacity={0.6}
            fill="#D19DFF"
          />
          <rect
            height="8"
            width={`${100 - consumedPct}%`}
            x={`${consumedPct}%`}
            opacity={0.2}
            fill="#FF8DCC"
          />
        </svg>
      </Flex>
    </>
  );
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
        startTs = transactions.txn_preload_end_timestamps_nanos[txnIdx];
      }

      const nextTxnIdx = bundleTxnIdx[bundleIdx + 1];
      if (nextTxnIdx > 0) {
        endTs = transactions.txn_preload_end_timestamps_nanos[nextTxnIdx];
      }

      bundleTotal =
        transactions.txn_mb_end_timestamps_nanos[
          bundleTxnIdx[bundleTxnIdx.length - 1]
        ] - transactions.txn_mb_start_timestamps_nanos[bundleTxnIdx[0]];
    }

    const preLoading =
      transactions.txn_preload_end_timestamps_nanos[txnIdx] - startTs;
    const validating =
      transactions.txn_start_timestamps_nanos[txnIdx] -
      transactions.txn_preload_end_timestamps_nanos[txnIdx];
    const loading =
      transactions.txn_load_end_timestamps_nanos[txnIdx] -
      transactions.txn_start_timestamps_nanos[txnIdx];
    const execute =
      transactions.txn_end_timestamps_nanos[txnIdx] -
      transactions.txn_load_end_timestamps_nanos[txnIdx];
    const postExecute = endTs - transactions.txn_end_timestamps_nanos[txnIdx];
    const total = endTs - startTs;

    return {
      preLoading,
      validating,
      loading,
      execute,
      postExecute,
      total,
      bundleTotal,
    };
  }, [bundleTxnIdx, transactions, txnIdx]);

  const durationRatios = useMemo(() => {
    if (!durations) return;

    const total = Number(durations.total);
    const preLoading = (Number(durations.preLoading) / total) * 100;
    const validating = (Number(durations.validating) / total) * 100;
    const loading = (Number(durations.loading) / total) * 100;
    const execute = (Number(durations.execute) / total) * 100;
    const postExecute = (Number(durations.postExecute) / total) * 100;

    return { preLoading, validating, loading, execute, postExecute };
  }, [durations]);

  const durationUnits = useMemo(() => {
    if (!durations) return;

    const preLoading = getDurationWithUnits(durations.preLoading);
    const validating = getDurationWithUnits(durations.validating);
    const loading = getDurationWithUnits(durations.loading);
    const execute = getDurationWithUnits(durations.execute);
    const postExecute = getDurationWithUnits(durations.postExecute);
    const total = getDurationWithUnits(durations.total);
    const bundleTotal =
      durations.bundleTotal != null &&
      getDurationWithUnits(durations.bundleTotal);

    return {
      preLoading,
      validating,
      loading,
      execute,
      postExecute,
      total,
      bundleTotal,
    };
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
            width={`${durationRatios.validating}%`}
            fill={stateTextColors[TxnState.VALIDATE]}
            x={`${durationRatios.preLoading}%`}
            y="20%"
          />
          <rect
            height="8"
            width={`${durationRatios.loading}%`}
            fill={stateTextColors[TxnState.LOADING]}
            x={`${durationRatios.preLoading + durationRatios.validating}%`}
            y="40%"
          />
          <rect
            height="8"
            width={`${durationRatios.execute}%`}
            fill={stateTextColors[TxnState.EXECUTE]}
            x={`${durationRatios.preLoading + durationRatios.validating + durationRatios.loading}%`}
            y="60%"
          />
          <rect
            height="8"
            width={`${durationRatios.postExecute}%`}
            fill={stateTextColors[TxnState.POST_EXECUTE]}
            x={`${durationRatios.preLoading + durationRatios.validating + durationRatios.loading + durationRatios.execute}%`}
            y="80%"
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
        label={TxnState.VALIDATE}
        color={stateTextColors[TxnState.VALIDATE]}
        value={durationUnits.validating.value}
        unit={durationUnits.validating.unit}
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
  copyValue?: string;
}

function LabelValueDisplay({
  label,
  value,
  color,
  unit,
  copyValue,
}: LabelValueDisplayProps) {
  const formattedValue =
    typeof value === "number" ? value.toLocaleString() : value;

  const [hasCopied, setHasCopied] = useState(false);
  const resetHasCopied = useDebouncedCallback(() => setHasCopied(false), 1_000);

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
      <Flex gap="2" align="center">
        <Text>{label}</Text>
        {copyValue && navigator.clipboard && (
          <Button
            variant="ghost"
            size="1"
            onClick={(e) => {
              void navigator.clipboard.writeText(copyValue);
              setHasCopied(true);
              resetHasCopied();
              // Seems to be caught sometimes by the outside tooltip click handler?
              // Not sure why since it's within the tooltip
              e.stopPropagation();
            }}
          >
            {hasCopied ? (
              <CheckIcon color="green" height="14px" />
            ) : (
              <CopyIcon color="#B4B4B4" height="14px" />
            )}
          </Button>
        )}
      </Flex>

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
