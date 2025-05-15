import { useAtomValue } from "jotai";
import styles from "./chartTooltip.module.css";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import { SlotTransactions } from "../../../../api/types";
import { Flex, Separator, Text } from "@radix-ui/themes";
import { errorCodeMap, stateTextColors, TxnState } from "./consts";
import { CSSProperties, useMemo } from "react";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";

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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexWrap: "wrap",
              flex: 1,
            }}
          >
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
            <LabelValueDisplay
              label="CU Income"
              value={`${(
                Number(
                  transactions.txn_priority_fee[txnIdx] +
                    transactions.txn_tips[txnIdx],
                ) / transactions.txn_compute_units_consumed[txnIdx]
              )?.toLocaleString()}`}
              color="#9EB1FF"
            />
            <RowSeparator />
            <LabelValueDisplay label="Txn Id" value={`${txnIdx}`} />
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
          </div>
        </Flex>
      )}
    </div>
  );
}

function nsFormat(value: bigint) {
  return `${value.toLocaleString()}ns`;
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

  if (!durations) return;

  return (
    <>
      <RowSeparator />
      <LabelValueDisplay
        label={TxnState.PRELOADING}
        value={nsFormat(durations.preLoading)}
        color={stateTextColors[TxnState.PRELOADING]}
      />
      <LabelValueDisplay
        label={TxnState.LOADING}
        value={nsFormat(durations.loading)}
        color={stateTextColors[TxnState.LOADING]}
      />
      <LabelValueDisplay
        label={TxnState.EXECUTE}
        value={nsFormat(durations.execute)}
        color={stateTextColors[TxnState.EXECUTE]}
      />
      <LabelValueDisplay
        label={TxnState.POST_EXECUTE}
        value={nsFormat(durations.postExecute)}
        color={stateTextColors[TxnState.POST_EXECUTE]}
      />
      <LabelValueDisplay label="Total" value={nsFormat(durations.total)} />
      {durations.bundleTotal && (
        <LabelValueDisplay
          label="Total (Bundle)"
          value={nsFormat(durations.bundleTotal)}
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
  value: string;
  color?: string;
}

function LabelValueDisplay({ label, value, color }: LabelValueDisplayProps) {
  return (
    <Flex
      justify="between"
      gap="3"
      style={
        {
          "--color-override": color,
        } as CSSProperties
      }
    >
      <Text>{label}</Text>
      <Text align="right">{value}</Text>
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
  return <Separator size="4" my="1" style={{ background: "#333333" }} />;
}
