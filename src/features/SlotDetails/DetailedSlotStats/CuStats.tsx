import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import { Section } from "./StatSection";
import { Grid, Text } from "@radix-ui/themes";
import { useSlotQueryResponseTransactions } from "../../../hooks/useSlotQuery";
import { useMemo } from "react";
import styles from "./cuStats.module.css";
import {
  computeUnitsColor,
  headerColor,
  nonVoteColor,
  requestedToggleControlColor,
  votesColor,
} from "../../../colors";

export default function CuStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);

  const stats = useMemo(() => {
    if (!query.response?.transactions) return;

    const { vote, nonVote } =
      query.response.transactions.txn_compute_units_consumed.reduce(
        (acc, consumed, i) => {
          const requested =
            query.response?.transactions?.txn_compute_units_requested[i] ?? 0;
          const isVote = !!query.response?.transactions?.txn_is_simple_vote[i];

          const { vote, nonVote } = acc;
          if (isVote) {
            vote.consumed += consumed;
            vote.requested += requested;
          } else {
            nonVote.consumed += consumed;
            nonVote.requested += requested;
          }

          return acc;
        },
        {
          vote: { consumed: 0, requested: 0 },
          nonVote: { consumed: 0, requested: 0 },
        },
      );

    const total = {
      consumed: vote.consumed + nonVote.consumed,
      requested: vote.requested + nonVote.requested,
    };

    return {
      vote,
      nonVote,
      total,
      totalCus: total.consumed + total.requested,
    };
  }, [query]);

  if (!stats) return;

  const { vote, nonVote, total, totalCus } = stats;

  return (
    <Section title="CU Stats (Consumed / Requested)">
      <Grid
        columns="repeat(3, auto) minmax(80px, 200px)"
        gapX="3"
        gapY="1"
        className={styles.statsGrid}
      >
        <StatRow
          label="Vote"
          consumed={vote.consumed}
          requested={vote.requested}
          total={totalCus}
          pctColor={votesColor}
        />
        <StatRow
          label="Non-Vote"
          consumed={nonVote.consumed}
          requested={nonVote.requested}
          total={totalCus}
          pctColor={nonVoteColor}
        />
        <StatRow
          label="Total"
          consumed={total.consumed}
          requested={total.requested}
          total={totalCus}
          pctColor={headerColor}
        />
      </Grid>
    </Section>
  );
}

interface StatRowProps {
  label: string;
  consumed: number;
  requested: number;
  total: number;
  pctColor: string;
}

function StatRow({
  label,
  consumed,
  requested,
  total,
  pctColor,
}: StatRowProps) {
  const consumedPct = total ? (consumed / total) * 100 : 0;
  const requestedPct = total ? (requested / total) * 100 : 0;

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-12)" }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }} align="right">
        {consumed.toLocaleString()} / {requested.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: pctColor }} align="right">
        {requested ? ((consumed / requested) * 100).toFixed(1) : "-"}%
      </Text>

      <svg
        height="8"
        width="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center" }}
      >
        <rect
          height="8"
          width={`${consumedPct}%`}
          opacity={0.6}
          fill={computeUnitsColor}
        />
        <rect
          height="8"
          width={`${requestedPct}%`}
          x={`${consumedPct}%`}
          opacity={0.2}
          fill={requestedToggleControlColor}
        />
      </svg>
    </>
  );
}
