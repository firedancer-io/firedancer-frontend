import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { Grid, Text } from "@radix-ui/themes";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { useMemo } from "react";
import {
  computeUnitsColor,
  headerColor,
  nonVoteColor,
  slotDetailsStatsPrimary,
  slotDetailsStatsSecondary,
  votesColor,
} from "../../../../colors";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";

const bundleColor = headerColor;

interface CuStats {
  vote: number;
  bundle: number;
  other: number;
}

export default function ComputeUnitStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);

  const stats = useMemo(() => {
    if (!query?.response?.transactions) return;

    return query.response.transactions.txn_compute_units_consumed.reduce<CuStats>(
      (acc, consumedCus, i) => {
        const isVote = !!query.response?.transactions?.txn_is_simple_vote[i];
        const isBundle = query.response?.transactions?.txn_from_bundle[i];

        if (isVote) {
          acc.vote += consumedCus;
        } else if (isBundle) {
          acc.bundle += consumedCus;
        } else {
          acc.other += consumedCus;
        }

        return acc;
      },
      { vote: 0, bundle: 0, other: 0 },
    );
  }, [query]);

  if (!stats) return;

  const totalCus = stats.vote + stats.bundle + stats.other;

  return (
    <SlotDetailsSubSection title="Consumed Compute Units">
      <Grid columns="repeat(5, auto) minmax(80px, auto)" gapX="2" gapY="1">
        <CuStatRow
          label="Vote"
          cus={stats.vote}
          totalCus={totalCus}
          pctColor={votesColor}
        />
        <CuStatRow
          label="Bundle"
          cus={stats.bundle}
          totalCus={totalCus}
          pctColor={bundleColor}
        />
        <CuStatRow
          label="Other"
          cus={stats.other}
          totalCus={totalCus}
          pctColor={nonVoteColor}
        />
      </Grid>
    </SlotDetailsSubSection>
  );
}

interface CuStatRowProps {
  label: string;
  cus: number;
  totalCus: number;
  pctColor: string;
}

function CuStatRow({ label, cus, totalCus, pctColor }: CuStatRowProps) {
  const cuPctFromTotal = Math.round(totalCus ? (cus / totalCus) * 100 : 0);

  return (
    <>
      <Text wrap="nowrap" style={{ color: slotDetailsStatsSecondary }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color: pctColor }} align="right">
        {cus.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: slotDetailsStatsPrimary }}>
        /
      </Text>
      <Text wrap="nowrap" style={{ color: computeUnitsColor }} align="right">
        {totalCus.toLocaleString()}
      </Text>
      <Text
        wrap="nowrap"
        style={{ color: slotDetailsStatsPrimary }}
        align="right"
      >
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
      </svg>
    </>
  );
}
