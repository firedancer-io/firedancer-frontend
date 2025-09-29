import { useAtomValue } from "jotai";
import styles from "./chartTooltip.module.css";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import type { SlotTransactions } from "../../../../api/types";
import { Button, Flex, Text } from "@radix-ui/themes";
import { stateTextColors, TxnState } from "./consts";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../atoms";
import UplotTooltip from "../../../../uplotReact/UplotTooltip";
import { calcTxnIncome, getCuIncomeRankings } from "./txnBarsPluginUtils";
import { Cross2Icon, CopyIcon, CheckIcon } from "@radix-ui/react-icons";
import { useDebouncedCallback } from "use-debounce";
import RowSeparator from "../../../../components/RowSeparator";
import { getDurationWithUnits } from "./chartUtils";
import { copyToClipboard, removePortFromIp } from "../../../../utils";
import {
  chartAxisColor,
  computeUnitsColor,
  errorToggleColor,
  feesColor,
  successToggleColor,
  tipsColor,
  requestedToggleControlColor,
  incomePerCuToggleControlColor,
  iconButtonColor,
} from "../../../../colors";
import { solDecimals, txnErrorCodeMap } from "../../../../consts";
import { peersListAtom } from "../../../../atoms";

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
              <Cross2Icon color={chartAxisColor} />
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
              color={feesColor}
            />
            <LabelValueDisplay
              label="Tips"
              value={`${transactions.txn_tips[txnIdx]?.toLocaleString()}`}
              color={tipsColor}
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
            <IpDisplay transactions={transactions} txnIdx={txnIdx} />
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

interface DisplayProps {
  transactions: SlotTransactions;
  txnIdx: number;
}

function IpDisplay({ transactions, txnIdx }: DisplayProps) {
  // TODO: don't pull all peers
  const peersList = useAtomValue(peersListAtom);
  const displayIp = transactions.txn_source_ipv4[txnIdx];
  const validatorDisplay = useMemo(() => {
    const peer = peersList.find((peer) => {
      if (!peer.gossip) return false;
      const ips = Object.values(peer.gossip.sockets);
      return ips.some((peerIp) => removePortFromIp(peerIp) === displayIp);
    });

    if (!peer) return;

    if (peer.info?.name) {
      if (peer.info.name.length > 20) {
        return `${peer.info.name.substring(0, 20)}...`;
      } else {
        return peer.info.name;
      }
    }

    return `${peer.identity_pubkey.substring(0, 8)}...`;
  }, [displayIp, peersList]);

  return (
    <>
      <LabelValueDisplay
        label="IPv4 (tpu)"
        value={`${displayIp} (${transactions.txn_source_tpu[txnIdx]})`}
      />
      {validatorDisplay && (
        <LabelValueDisplay label="Validator" value={validatorDisplay} />
      )}
    </>
  );
}

function IncomeDisplay({ transactions, txnIdx }: DisplayProps) {
  const { rankings, totalRanks } = useMemo(
    () => getCuIncomeRankings(transactions),
    [transactions],
  );

  const rankText = rankings.has(txnIdx)
    ? ` (${rankings.get(txnIdx)} of ${totalRanks})`
    : "";

  return (
    <LabelValueDisplay
      label="CU Income"
      value={`${calcTxnIncome(transactions, txnIdx)?.toLocaleString(undefined, {
        maximumFractionDigits: solDecimals,
      })}${rankText}`}
      color={incomePerCuToggleControlColor}
    />
  );
}

function CuDisplay({ transactions, txnIdx }: DisplayProps) {
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
        color={computeUnitsColor}
      />
      <LabelValueDisplay
        label="CU Requested"
        value={`${transactions.txn_compute_units_requested[txnIdx]?.toLocaleString()}`}
        color={requestedToggleControlColor}
      />
      <IncomeDisplay transactions={transactions} txnIdx={txnIdx} />
      <Flex>
        <svg
          height="8"
          fill="none"
          className={styles.cuBars}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            height="8"
            width={`${consumedPct}%`}
            opacity={0.6}
            fill={computeUnitsColor}
          />
          <rect
            height="8"
            width={`${100 - consumedPct}%`}
            x={`${consumedPct}%`}
            opacity={0.2}
            fill={requestedToggleControlColor}
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
    const preLoading = Math.max(
      0,
      (Number(durations.preLoading) / total) * 100,
    );
    const validating = Math.max(
      0,
      (Number(durations.validating) / total) * 100,
    );
    const loading = Math.max(0, (Number(durations.loading) / total) * 100);
    const execute = Math.max(0, (Number(durations.execute) / total) * 100);
    const postExecute = Math.max(
      0,
      (Number(durations.postExecute) / total) * 100,
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
        <svg
          height="36"
          className={styles.durationContainer}
          xmlns="http://www.w3.org/2000/svg"
        >
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
      value={isError ? `${txnErrorCodeMap[errorCode]}` : "Yes"}
      color={isError ? errorToggleColor : successToggleColor}
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
        {copyValue && (
          <Button
            variant="ghost"
            size="1"
            onClick={(e) => {
              copyToClipboard(copyValue);
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
              <CopyIcon color={iconButtonColor} height="14px" />
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
