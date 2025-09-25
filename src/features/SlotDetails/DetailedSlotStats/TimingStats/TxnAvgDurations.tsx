import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { nonVoteColor, votesColor } from "../../../../colors";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";

export default function TxnAvgDurations() {
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
      let startTs = transactions.txn_mb_start_timestamps_nanos[i];
      let endTs = transactions.txn_mb_end_timestamps_nanos[i];
      let bundleTotal = null;

      // TODO: fix for bundles
      // if (transactions.txn_from_bundle[i] && bundleTxnIdx?.length) {
      //   const bundleIdx = bundleTxnIdx.indexOf(txnIdx) ?? -1;
      //   const prevTxnIdx = bundleTxnIdx[bundleIdx - 1];
      //   if (prevTxnIdx > 0) {
      //     startTs = transactions.txn_preload_end_timestamps_nanos[i];
      //   }

      //   const nextTxnIdx = bundleTxnIdx[bundleIdx + 1];
      //   if (nextTxnIdx > 0) {
      //     endTs = transactions.txn_preload_end_timestamps_nanos[nextTxnIdx];
      //   }

      //   bundleTotal =
      //     transactions.txn_mb_end_timestamps_nanos[
      //       bundleTxnIdx[bundleTxnIdx.length - 1]
      //     ] - transactions.txn_mb_start_timestamps_nanos[bundleTxnIdx[0]];
      // }

      let total = 0n;

      total += transactions.txn_preload_end_timestamps_nanos[i] - startTs;
      total +=
        transactions.txn_start_timestamps_nanos[i] -
        transactions.txn_preload_end_timestamps_nanos[i];
      total +=
        transactions.txn_load_end_timestamps_nanos[i] -
        transactions.txn_start_timestamps_nanos[i];
      total +=
        transactions.txn_end_timestamps_nanos[i] -
        transactions.txn_load_end_timestamps_nanos[i];
      total += endTs - transactions.txn_end_timestamps_nanos[i];
      //  total = endTs - startTs;

      const totalNum = Number(total);

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
  }, [transactions]);

  if (!durations) return;

  const max = Math.max(
    durations.voteMax,
    durations.nonVoteMax,
    durations.bundleMax,
  );

  return (
    <>
      <Text style={{ color: "var(--gray-12)" }}>
        Min / Avg / Max Successful Txn Duration
      </Text>
      <Grid columns="repeat(7, auto)" gapX="3" gapY="1">
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
    </>
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

function Row({ label, value, max, color, minValue, maxValue }: RowProps) {
  const pct = (value / max) * 100;
  const minPct = (minValue / max) * 100;
  const maxPct = (maxValue / max) * 100;

  const formatted = getDurationWithUnits(value);
  const minFormatted = getDurationWithUnits(minValue);
  const maxFormatted = getDurationWithUnits(maxValue);

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color: "#6E56CF" }} align="right">
        {`${minFormatted.value} `}
        <span
          style={{
            fontFamily: "Roboto Mono",
          }}
        >
          {minFormatted.unit}
        </span>
      </Text>
      <Text>/</Text>
      <Text wrap="nowrap" style={{ color: "#BAA7FF" }} align="right">
        {`${formatted.value} `}
        <span
          style={{
            fontFamily: "Roboto Mono",
          }}
        >
          {formatted.unit}
        </span>
      </Text>
      <Text>/</Text>
      <Text wrap="nowrap" style={{ color: "#6E56CF" }} align="right">
        {`${maxFormatted.value} `}
        <span
          style={{
            fontFamily: "Roboto Mono",
          }}
        >
          {maxFormatted.unit}
        </span>
      </Text>
      <svg
        height="16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center", width: "100%" }}
      >
        <rect
          height="10%"
          y="45%"
          width={`${100}%`}
          opacity={0.6}
          fill={"#313131"}
        />
        <rect
          height="80%"
          y="10%"
          x={`${minPct}%`}
          width="4px"
          opacity={1}
          fill={"#56468B"}
        />
        <rect
          height="80%"
          y="10%"
          x={`${pct}%`}
          width="4px"
          opacity={1}
          fill={"#BAA7FF"}
        />
        <rect
          height="80%"
          y="10%"
          x={`${maxPct}%`}
          width="4px"
          opacity={1}
          fill={"#56468B"}
        />
      </svg>
      {/* <svg
        height="16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center", width: "100%" }}
      >
        <rect height="25%" width={`${minPct}%`} opacity={0.6} fill={color} />
        <rect
          height="25%"
          y="33%"
          width={`${pct}%`}
          opacity={0.6}
          fill={color}
        />
        <rect
          height="25%"
          y="66%"
          width={`${maxPct}%`}
          opacity={0.6}
          fill={color}
        />
      </svg> */}
    </>
  );
}
