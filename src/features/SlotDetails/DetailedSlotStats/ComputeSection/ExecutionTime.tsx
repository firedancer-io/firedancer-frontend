import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { nonVoteColor, votesColor } from "../../../../colors";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import MonoText from "../../../../components/MonoText";
import styles from "../detailedSlotStats.module.css";
import { gridGapX, gridGapY } from "../consts";
import {
  getTxnBundleStats,
  getTxnStateDurations,
} from "../../../../transactionUtils";
import { clientAtom } from "../../../../atoms";
import { sum, values } from "lodash";

export default function ExecutionTime() {
  const client = useAtomValue(clientAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);
  const transactions = query.response?.transactions;

  const durations = useMemo(() => {
    if (!transactions) return;

    const { vote, nonVote, bundle } = {
      vote: { count: 0, total: 0, min: Infinity, max: -Infinity },
      nonVote: { count: 0, total: 0, min: Infinity, max: -Infinity },
      bundle: { count: 0, total: 0, min: Infinity, max: -Infinity },
    };

    for (
      let i = 0;
      i < transactions.txn_mb_start_timestamps_nanos.length;
      i++
    ) {
      const bundleStats = getTxnBundleStats(transactions, i);
      const duration = getTxnStateDurations(
        transactions,
        i,
        bundleStats.bundleTxnIdx,
        client,
      );

      const totalNum = sum(values(duration).map((n) => Number(n)));

      if (transactions.txn_is_simple_vote[i]) {
        vote.total += totalNum;
        vote.count++;
        vote.min = Math.min(vote.min, totalNum);
        vote.max = Math.max(vote.max, totalNum);
      } else {
        nonVote.total += totalNum;
        nonVote.count++;
        nonVote.min = Math.min(nonVote.min, totalNum);
        nonVote.max = Math.max(nonVote.max, totalNum);
      }

      if (transactions.txn_from_bundle[i]) {
        bundle.total += totalNum;
        bundle.count++;
        bundle.min = Math.min(bundle.min, totalNum);
        bundle.max = Math.max(bundle.max, totalNum);
      }
    }

    return {
      vote: vote.total / vote.count,
      nonVote: nonVote.total / nonVote.count,
      bundle: bundle.total / bundle.count,
      voteMin: vote.min,
      voteMax: vote.max,
      nonVoteMin: nonVote.min,
      nonVoteMax: nonVote.max,
      bundleMin: bundle.min,
      bundleMax: bundle.max,
    };
  }, [transactions, client]);

  if (!durations) return;

  const max = Math.max(
    durations.voteMax,
    durations.nonVoteMax,
    durations.bundleMax,
  );

  return (
    <SlotDetailsSubSection title="Execution Time (min / avg / max)">
      <Grid columns="repeat(7, auto)" gapX={gridGapX} gapY={gridGapY}>
        <Row
          label="Vote"
          value={durations.vote}
          color={votesColor}
          max={max}
          minValue={durations.voteMin}
          maxValue={durations.voteMax}
        />
        <Row
          label="Non-vote"
          value={durations.nonVote}
          color={nonVoteColor}
          max={max}
          minValue={durations.nonVoteMin}
          maxValue={durations.nonVoteMax}
        />
        <Row
          label="Bundle"
          value={durations.bundle}
          color="var(--purple-9)"
          max={max}
          minValue={durations.bundleMin}
          maxValue={durations.bundleMax}
        />
      </Grid>
    </SlotDetailsSubSection>
  );
}

interface RowProps {
  label: string;
  value: number;
  minValue: number;
  maxValue: number;
  max: number;
  color: string;
}

const markerWidth = 4;
const markerWidthPx = `${markerWidth}px`;

function getX(pct: number) {
  return `clamp(0px, calc(${pct}% - ${markerWidth / 2}px), calc(100% - ${markerWidthPx}))`;
}

function Row({ label, value, max, minValue, maxValue }: RowProps) {
  const pct = (value / max) * 100;
  const minPct = (minValue / max) * 100;
  const maxPct = (maxValue / max) * 100;

  const formatted = getDurationWithUnits(value);
  const minFormatted = getDurationWithUnits(minValue);
  const maxFormatted = getDurationWithUnits(maxValue);

  return (
    <>
      <Text className={styles.label}>{label}</Text>
      <Text className={styles.value} style={{ color: "#6E56CF" }} align="right">
        {minFormatted.value}
        <MonoText>{minFormatted.unit}</MonoText>
      </Text>
      <Text className={styles.value}>/</Text>
      <Text className={styles.value} style={{ color: "#BAA7FF" }} align="right">
        {formatted.value}
        <MonoText>{formatted.unit}</MonoText>
      </Text>
      <Text className={styles.value}>/</Text>
      <Text className={styles.value} style={{ color: "#6E56CF" }} align="right">
        {maxFormatted.value}
        <MonoText>{maxFormatted.unit}</MonoText>
      </Text>
      <svg
        height="13"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center", width: "100%" }}
      >
        <rect height="10%" y="45%" width="100%" opacity={0.6} fill="#313131" />
        <rect
          height="80%"
          y="10%"
          x={getX(minPct)}
          width={markerWidthPx}
          fill="#56468B"
        />
        <rect
          height="80%"
          y="10%"
          x={getX(maxPct)}
          width={markerWidthPx}
          fill="#56468B"
        />
        {/* Draw avg last to overlap either min or max */}
        <rect
          height="80%"
          y="10%"
          x={getX(pct)}
          width={markerWidthPx}
          fill="#BAA7FF"
        />
      </svg>
    </>
  );
}
