import { useAtomValue, useSetAtom } from "jotai";
import { Flex, Text, IconButton } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { replayTxnTimestampsCacheAtom } from "./ExecrpTrack/txnTimestamps";
import { replayTxnMetaCacheAtom } from "./RevenueTrack/txnMeta";
import {
  selectedInfoAtom,
  findTxnTimestamps,
  findTxnMeta,
  type SelectedInfo as SelectedInfoValue,
} from "./selectedInfo";
import { getDurationWithUnits } from "../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import {
  stateTextColors,
  TxnState,
} from "../Overview/SlotPerformance/TransactionBarsCard/consts";
import { lamportsPerSol, txnErrorCodeMap } from "../../consts";
import { formatTimeNanos } from "../../utils";
import { RevenueType } from "../../api/entities";
import {
  feesColor,
  tipsColor,
  successToggleColor,
  errorToggleColor,
} from "../../colors";
import styles from "./selectedInfo.module.css";

/** Duration (ns) between two absolute-ns phase timestamps, or undefined. */
function durationNs(
  start: bigint | undefined,
  end: bigint | undefined,
): bigint | undefined {
  if (start === undefined || end === undefined) return undefined;
  return end - start;
}

function fmtDuration(ns: bigint | undefined): string {
  if (ns === undefined) return "—";
  const { value, unit } = getDurationWithUnits(ns);
  return `${value.toLocaleString()} ${unit}`;
}

function fmtSol(lamports: bigint): string {
  const sol = (Number(lamports) / lamportsPerSol).toLocaleString(undefined, {
    maximumSignificantDigits: 4,
  });
  return `${sol} SOL`;
}

const REVENUE_TYPE_LABEL: Record<RevenueType, string> = {
  [RevenueType.TxnFees]: "Txn Fees",
  [RevenueType.PrioFees]: "Priority Fees",
  [RevenueType.Tips]: "Tips",
};

/**
 * Shared info banner next to the "Replay" card header. Any track can populate it
 * via `selectedInfoAtom` (a txn clicked on the execrp track, or an aggregated
 * fee bucket clicked on the revenue track). Scrolls horizontally only when the
 * fields overflow; hidden when nothing is selected.
 */
export default function SelectedInfo() {
  const selected = useAtomValue(selectedInfoAtom);
  const setSelected = useSetAtom(selectedInfoAtom);

  if (!selected) return null;

  return (
    <Flex align="center" gap="2" className={styles.container}>
      <Flex align="center" gap="3" className={styles.scroll}>
        {selected.kind === "txn" ? (
          <TxnFields selected={selected} />
        ) : (
          <AggBucketFields selected={selected} />
        )}
      </Flex>
      <IconButton
        variant="ghost"
        size="1"
        color="gray"
        onClick={() => setSelected(undefined)}
        aria-label="Clear selection"
      >
        <Cross2Icon />
      </IconButton>
    </Flex>
  );
}

function AggBucketFields({
  selected,
}: {
  selected: Extract<SelectedInfoValue, { kind: "aggBucket" }>;
}) {
  const start = formatTimeNanos(selected.startNs, {
    showTimezoneName: false,
  }).inMillis;
  const end = formatTimeNanos(selected.endNs, {
    showTimezoneName: false,
  }).inMillis;

  return (
    <>
      <Field label="Bucket" value={REVENUE_TYPE_LABEL[selected.type]} />
      <Field label="Range" value={`${start} – ${end}`} />
      <Field label="Value" color={feesColor} value={fmtSol(selected.value)} />
    </>
  );
}

function TxnFields({
  selected,
}: {
  selected: Extract<SelectedInfoValue, { kind: "txn" }>;
}) {
  const timestampsCache = useAtomValue(replayTxnTimestampsCacheAtom);
  const metaCache = useAtomValue(replayTxnMetaCacheAtom);

  const ts = findTxnTimestamps(timestampsCache, selected.slot, selected.txnIdx);
  const meta = findTxnMeta(metaCache, selected.slot, selected.txnIdx);

  const errorCode = ts?.txns.txn_error_code[ts.i];
  const isError = errorCode !== undefined && errorCode !== 0;

  return (
    <>
      <Field label="Slot" value={selected.slot.toLocaleString()} />
      <Field label="Txn" value={`${selected.txnIdx}`} />
      {errorCode !== undefined && (
        <Field
          label={isError ? "Error" : "Status"}
          value={
            isError
              ? (txnErrorCodeMap[errorCode] ?? `#${errorCode}`)
              : "Success"
          }
          color={isError ? errorToggleColor : successToggleColor}
        />
      )}
      {ts && (
        <>
          <Field
            label="Sigverify"
            value={fmtDuration(
              durationNs(
                ts.txns.txn_sigverify_start_nanos[ts.i],
                ts.txns.txn_sigverify_end_nanos[ts.i],
              ),
            )}
          />
          <Field
            label={TxnState.LOADING}
            color={stateTextColors[TxnState.LOADING]}
            value={fmtDuration(
              durationNs(
                ts.txns.txn_load_start_nanos[ts.i],
                ts.txns.txn_check_start_nanos[ts.i] ??
                  ts.txns.txn_exec_start_nanos[ts.i] ??
                  ts.txns.txn_commit_start_nanos[ts.i] ??
                  ts.txns.txn_commit_end_nanos[ts.i],
              ),
            )}
          />
          <Field
            label={TxnState.VALIDATE}
            color={stateTextColors[TxnState.VALIDATE]}
            value={fmtDuration(
              durationNs(
                ts.txns.txn_check_start_nanos[ts.i],
                ts.txns.txn_exec_start_nanos[ts.i] ??
                  ts.txns.txn_commit_start_nanos[ts.i] ??
                  ts.txns.txn_commit_end_nanos[ts.i],
              ),
            )}
          />
          <Field
            label={TxnState.EXECUTE}
            color={stateTextColors[TxnState.EXECUTE]}
            value={fmtDuration(
              durationNs(
                ts.txns.txn_exec_start_nanos[ts.i],
                ts.txns.txn_commit_start_nanos[ts.i] ??
                  ts.txns.txn_commit_end_nanos[ts.i],
              ),
            )}
          />
          <Field
            label={TxnState.POST_EXECUTE}
            color={stateTextColors[TxnState.POST_EXECUTE]}
            value={fmtDuration(
              durationNs(
                ts.txns.txn_commit_start_nanos[ts.i],
                ts.txns.txn_commit_end_nanos[ts.i],
              ),
            )}
          />
          <Field
            label="Total"
            value={fmtDuration(
              durationNs(
                ts.txns.txn_load_start_nanos[ts.i],
                ts.txns.txn_commit_end_nanos[ts.i],
              ),
            )}
          />
        </>
      )}
      {meta && (
        <>
          <Field
            label="Txn Fee"
            color={feesColor}
            value={meta.txns.txn_transaction_fee[meta.i].toLocaleString()}
          />
          <Field
            label="Prio Fee"
            color={feesColor}
            value={meta.txns.txn_priority_fee[meta.i].toLocaleString()}
          />
          <Field
            label="Tips"
            color={tipsColor}
            value={meta.txns.txn_tips[meta.i].toLocaleString()}
          />
        </>
      )}
      {!ts && !meta && (
        <Text className={styles.pending}>Loading transaction…</Text>
      )}
    </>
  );
}

interface FieldProps {
  label: string;
  value: string;
  color?: string;
}

function Field({ label, value, color }: FieldProps) {
  return (
    <Flex direction="column" className={styles.field}>
      <Text className={styles.label}>{label}</Text>
      <Text className={styles.value} style={color ? { color } : undefined}>
        {value}
      </Text>
    </Flex>
  );
}
