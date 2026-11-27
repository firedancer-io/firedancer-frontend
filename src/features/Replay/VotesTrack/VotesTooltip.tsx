import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator";
import { targetSlotMsAtom } from "../../../atoms";
import { CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { failureColor, successColor, votesSkippedColor } from "../../../colors";
import ReplayCursorTooltip, {
  CursorTimestampRow,
  SlotLeaderRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip";
import { hoveredVotesAtom } from "../atoms";
import { formatSignedMs } from "../Tooltip/utils";
import { slotVotesAtom } from "./atoms";
import {
  CertKind,
  VoteKind,
  latencyLineLabels,
  ownVoteLabels,
  type VoteLine,
} from "./consts";
import { getSlotStartTs } from "./latency";
import styles from "./votesTooltip.module.css";

const certRows: { cert: CertKind; label: string; color?: string }[] = [
  { cert: CertKind.Notar, label: latencyLineLabels.notarized },
  { cert: CertKind.NotarFallback, label: "Notarized + fallback (60%)" },
  { cert: CertKind.FastFinalize, label: latencyLineLabels.fast },
  { cert: CertKind.Finalize, label: latencyLineLabels.slow },
  { cert: CertKind.Skip, label: "Skipped (60%)", color: votesSkippedColor },
];

// tooltip row order
const ownVoteKinds = [
  VoteKind.Notar,
  VoteKind.NotarFallback,
  VoteKind.Skip,
  VoteKind.SkipFallback,
  VoteKind.Finalize,
];

const stakeRows: { line: VoteLine; label: string }[] = [
  { line: "notar", label: "Voted to notarize" },
  { line: "notarFallback", label: "Voted to notarize + fallback" },
  { line: "skip", label: "Voted to skip + fallback" },
  { line: "finalize", label: "Voted to finalize" },
];

function formatStakePct(frac: number) {
  const pct = frac * 100;
  if (pct >= 1) return String(Math.round(pct));
  return pct >= 0.1 ? pct.toFixed(1) : "<0.1";
}

function formatOffsetMs(ts: number | undefined, startTs: number | undefined) {
  if (ts === undefined || startTs === undefined) return;
  return formatSignedMs(ts - startTs);
}

export default function VotesTooltip() {
  const hovered = useAtomValue(hoveredVotesAtom);
  if (hovered == null) return null;
  return (
    <ReplayCursorTooltip>
      <SlotVotesTooltipContent slot={hovered.slot} />
    </ReplayCursorTooltip>
  );
}

function SlotVotesTooltipContent({ slot }: { slot: number }) {
  const slotVotes = useAtomValue(slotVotesAtom);
  const targetSlotMs = useAtomValue(targetSlotMsAtom);
  const startTs = getSlotStartTs(slotVotes, slot, targetSlotMs);

  const votes = slotVotes.get(slot);
  const certTimes = certRows.flatMap(({ cert, label, color }) => {
    const ts = votes?.certs.get(cert);
    return ts === undefined ? [] : [{ cert, label, color, ts }];
  });
  const ownVotes = ownVoteKinds.flatMap((kind) => {
    const ts = votes?.ownVotes.get(kind);
    return ts === undefined ? [] : [{ kind, label: ownVoteLabels[kind], ts }];
  });
  // each line's final fraction of stake
  const stakes = stakeRows.flatMap(({ line, label }) => {
    const frac = votes?.[line]?.frac.at(-1);
    return frac ? [{ line, label, frac }] : [];
  });

  return (
    <>
      <TooltipHeader>Slot {slot}</TooltipHeader>

      <RowSeparator />
      <SlotLeaderRow slot={slot} />
      <TooltipRow
        label="Rewarded"
        value={
          votes === undefined ? undefined : votes.rewardAckTs !== undefined ? (
            <CheckIcon
              color={successColor}
              className={styles.rewardedIcon}
              role="img"
              aria-label="Rewarded"
            />
          ) : (
            <Cross2Icon
              color={failureColor}
              className={styles.rewardedIcon}
              role="img"
              aria-label="Not rewarded"
            />
          )
        }
      />

      {certTimes.length > 0 && (
        <>
          <RowSeparator />
          {certTimes.map(({ cert, label, color, ts }) => (
            <TooltipRow
              key={cert}
              label={label}
              value={formatOffsetMs(ts, startTs)}
              unit="ms"
              valueColor={color}
            />
          ))}
        </>
      )}

      {ownVotes.length > 0 && (
        <>
          <RowSeparator />
          {ownVotes.map(({ kind, label, ts }) => (
            <TooltipRow
              key={kind}
              label={label}
              value={formatOffsetMs(ts, startTs)}
              unit="ms"
            />
          ))}
        </>
      )}

      {stakes.length > 0 && (
        <>
          <RowSeparator />
          {stakes.map(({ line, label, frac }) => (
            <TooltipRow
              key={line}
              label={label}
              value={formatStakePct(frac)}
              unit="%"
            />
          ))}
        </>
      )}

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
