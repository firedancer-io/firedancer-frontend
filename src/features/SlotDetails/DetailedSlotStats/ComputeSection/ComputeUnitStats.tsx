import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { Grid, Text } from "@radix-ui/themes";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { useMemo } from "react";
import styles from "./computeUnitStats.module.css";
import {
  computeUnitsColor,
  headerColor,
  nonVoteColor,
  requestedToggleControlColor,
  votesColor,
} from "../../../../colors";
import { defaultMaxComputeUnits } from "../../../../consts";

interface CuStats {
  vote: number;
  bundle: number;
  other: number;
}

export default function ComputeUnitStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);
  const maxComputeUnits =
    query.response?.publish?.max_compute_units ?? defaultMaxComputeUnits;

  const stats = useMemo(() => {
    if (!query?.response?.transactions) return;

    return query.response.transactions.txn_compute_units_consumed.reduce<{
      consumed: CuStats;
      requested: CuStats;
    }>(
      (acc, consumedCus, i) => {
        const requestedCus =
          query.response?.transactions?.txn_compute_units_requested[i] ?? 0;
        const isVote = !!query.response?.transactions?.txn_is_simple_vote[i];
        const isBundle = query.response?.transactions?.txn_from_bundle[i];

        const { consumed, requested } = acc;
        if (isVote) {
          consumed.vote += consumedCus;
          requested.vote += requestedCus;
        } else if (isBundle) {
          consumed.bundle += consumedCus;
          requested.bundle += requestedCus;
        } else {
          consumed.other += consumedCus;
          requested.other += requestedCus;
        }

        return acc;
      },
      {
        consumed: { vote: 0, bundle: 0, other: 0 },
        requested: { vote: 0, bundle: 0, other: 0 },
      },
    );
  }, [query]);

  if (!stats) return;

  const { consumed, requested } = stats;

  return (
    <>
      <CuStatsDisplay
        cuStats={consumed}
        title="Consumed"
        maxCus={maxComputeUnits}
      />
      {/* <CuStatsDisplay
        cuStats={requested}
        title="Requested"
        maxCus={maxComputeUnits}
      /> */}
      {/* <Grid
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
      </Grid> */}
    </>
  );
}

const bundleColor = headerColor;

interface CuStatsDisplayProps {
  cuStats: CuStats;
  title: string;
  maxCus: number;
}

function CuStatsDisplay({ cuStats, title, maxCus }: CuStatsDisplayProps) {
  const totalCus = cuStats.vote + cuStats.bundle + cuStats.other;
  return (
    <div>
      <Text style={{ color: "var(--gray-12)" }}>{title} Compute Units</Text>
      <Grid
        columns="repeat(5, auto) minmax(80px, auto)"
        gapX="2"
        gapY="1"
        className={styles.statsGrid}
      >
        <CuStatRow
          label="Vote"
          cus={cuStats.vote}
          maxCus={maxCus}
          totalCus={totalCus}
          pctColor={votesColor}
        />
        <CuStatRow
          label="Bundle"
          cus={cuStats.bundle}
          maxCus={maxCus}
          totalCus={totalCus}
          pctColor={bundleColor}
        />
        <CuStatRow
          label="Other"
          cus={cuStats.other}
          maxCus={maxCus}
          totalCus={totalCus}
          pctColor={nonVoteColor}
        />
        {/* <CuStatTotalRow stats={cuStats} maxCus={maxCus} /> */}
      </Grid>
    </div>
  );
}

interface CuStatRowProps {
  label: string;
  cus: number;
  totalCus: number;
  maxCus: number;
  pctColor: string;
}

function CuStatRow({ label, cus, totalCus, maxCus, pctColor }: CuStatRowProps) {
  const cuPctFromTotal = Math.round(totalCus ? (cus / totalCus) * 100 : 0);
  // const cuPct = maxCus ? (cus / maxCus) * 100 : 0;
  // const totalPct = maxCus ? ((totalCus - cus) / maxCus) * 100 : 0;

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        {label}
      </Text>
      {/* <Text wrap="nowrap" style={{ color: "var(--gray-11)" }} align="right">
        {consumed.toLocaleString()} / {requested.toLocaleString()}
      </Text> */}
      <Text wrap="nowrap" style={{ color: pctColor }} align="right">
        {cus.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-10)" }}>
        /
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-10)" }} align="right">
        {totalCus.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-10)" }} align="right">
        {cuPctFromTotal}%
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
          width={`${cuPctFromTotal}%`}
          opacity={0.6}
          fill={pctColor}
        />
        {/* <rect
          height="8"
          width={`${totalPct}%`}
          x={`${cuPct}%`}
          opacity={0.2}
          fill={requestedToggleControlColor}
        /> */}
      </svg>
    </>
  );
}

interface CuStatTotalRowProps {
  stats: CuStats;
  maxCus: number;
}

function CuStatTotalRow({ stats, maxCus }: CuStatTotalRowProps) {
  const total = stats.vote + stats.bundle + stats.other;
  const totalPct = maxCus ? Math.trunc((total / maxCus) * 100) : 0;
  const votePct = maxCus ? Math.trunc((stats.vote / maxCus) * 100) : 0;
  const bundlePct = maxCus ? Math.trunc((stats.bundle / maxCus) * 100) : 0;
  const otherPct = maxCus ? Math.trunc((stats.other / maxCus) * 100) : 0;

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        Total
      </Text>
      <Text wrap="nowrap" style={{ color: computeUnitsColor }} align="right">
        {total.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        &nbsp;/&nbsp;
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }} align="right">
        {maxCus.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: computeUnitsColor }} align="right">
        {totalPct}%
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
          width={`${votePct}%`}
          opacity={0.6}
          fill={votesColor}
        />
        <rect
          height="8"
          width={`${bundlePct}%`}
          x={`${votePct}%`}
          opacity={0.6}
          fill={bundleColor}
        />
        <rect
          height="8"
          width={`${otherPct}%`}
          x={`${votePct + bundlePct}%`}
          opacity={0.6}
          fill={nonVoteColor}
        />
      </svg>
    </>
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
