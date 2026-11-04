import { useAtomValue } from "jotai";
import { DateTime } from "luxon";
import { startCase } from "lodash";
import { nsPerMs } from "../../../consts";
import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import { formatSol, sumLamports } from "../Tooltip/utils";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { useSlotTransactions } from "../TileStatesTrack/useSlotTransactions";
import { hoveredSlotInfoAtom, referenceNsAtom } from "../atoms";
import { calcAbsoluteNs } from "../utils";
import type { SlotInfo } from "./nonAggAtoms";
import { useSlotLevel } from "./useSlotLevel";
import styles from "./replaySlotTooltip.module.css";

/** add nullable counts; undefined if all are missing */
function sumNullableCounts(...counts: (number | null | undefined)[]) {
  if (counts.every((c) => c == null)) return undefined;
  return counts.reduce<number>((sum, c) => sum + (c ?? 0), 0);
}

/**
 * General slot info tooltip
 */
export default function ReplaySlotTooltip() {
  const slotInfo = useAtomValue(hoveredSlotInfoAtom);
  const referenceNs = useAtomValue(referenceNsAtom);
  // without a reference ts the slot's timeline can't be anchored
  if (slotInfo == null || referenceNs === undefined) return null;

  return (
    <ReplayCursorTooltip>
      <SlotTooltipContent slotInfo={slotInfo} referenceNs={referenceNs} />
    </ReplayCursorTooltip>
  );
}

interface SlotTooltipContentProps {
  slotInfo: SlotInfo;
  referenceNs: bigint;
}

function SlotTooltipContent({
  slotInfo,
  referenceNs,
}: SlotTooltipContentProps) {
  const { slot, startMs, endMs, isSkipped, shredCnt, txnFees, prioFees, tips } =
    slotInfo;

  const slotStartNs = calcAbsoluteNs(referenceNs, startMs);
  const slotEndNs = calcAbsoluteNs(referenceNs, endMs);

  const { name, isLeader } = useSlotInfo(slot);
  const level = useSlotLevel(slot, isSkipped);
  const transactions = useSlotTransactions(slot, slotStartNs, slotEndNs, 200);

  // only hit the per-slot publish query when a cache couldn't supply the data
  const isMissingData = transactions == null;
  const { publish } = useSlotQueryPublish(isMissingData ? slot : undefined);

  const startTime = DateTime.fromMillis(
    Number(slotStartNs / BigInt(nsPerMs)),
  ).toFormat("h:mm:ss.SSS");

  const durationMs = Math.round(endMs - startMs);

  const feesLamports = sumLamports(txnFees, prioFees);
  const tipsLamports = tips ?? undefined;
  const incomeLamports = sumLamports(feesLamports, tipsLamports);

  const totalTxnCount =
    transactions?.totalCount ??
    sumNullableCounts(
      publish?.success_transaction_cnt,
      publish?.failed_transaction_cnt,
      publish?.success_vote_transaction_cnt,
      publish?.failed_vote_transaction_cnt,
    );
  const failedTxnCount =
    transactions?.failedCount ??
    sumNullableCounts(
      publish?.failed_transaction_cnt,
      publish?.failed_vote_transaction_cnt,
    );

  return (
    <>
      <TooltipHeader colorClassName={isSkipped ? styles.skipped : undefined}>
        Slot {slot}
      </TooltipHeader>

      <RowSeparator />
      <TooltipRow label="Leader" value={isLeader ? `You · ${name}` : name} />
      <TooltipRow
        label="Status"
        value={startCase(level)}
        valueColorClassName={
          level === "skipped" || level === "skip_notarized"
            ? styles.skipped
            : undefined
        }
      />

      <RowSeparator />
      <TooltipRow label="Started" value={startTime} />
      <TooltipRow label="Duration" value={durationMs} unit="ms" />

      <RowSeparator />
      <TooltipRow label="Shreds" value={shredCnt} />
      <TooltipRow label="Transactions" value={totalTxnCount} />
      <TooltipRow label="Failed" value={failedTxnCount} />

      <RowSeparator />
      <TooltipRow
        label="Income"
        value={formatSol(incomeLamports)}
        unit="SOL"
        valueColorClassName={styles.income}
      />
      <TooltipRow
        label="Fees"
        value={formatSol(feesLamports)}
        unit="SOL"
        valueColorClassName={styles.fees}
      />
      <TooltipRow
        label="Tips"
        value={formatSol(tipsLamports)}
        unit="SOL"
        valueColorClassName={styles.tips}
      />
      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
