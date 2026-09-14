import { useAtomValue } from "jotai";
import { isAlpenglowAtom } from "../../../../api/atoms";
import { Grid, Text } from "@radix-ui/themes";
import { useSlotTransactionsContext } from "../../SlotTransactionsContext";
import {
  computeUnitsColor,
  headerColor,
  nonVoteColor,
  votesColor,
} from "../../../../colors";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import styles from "../detailedSlotStats.module.css";
import { gridGapX, gridGapY } from "../consts";

const bundleColor = headerColor;

export default function ComputeUnitStats() {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const { computeUnitStats: stats } = useSlotTransactionsContext() ?? {};

  if (!stats) return;

  const totalCus = stats.vote + stats.bundle + stats.other;
  const maxCus = Math.max(stats.vote, stats.bundle, stats.other);

  return (
    <SlotDetailsSubSection title="Consumed Compute Units">
      <Grid
        columns="repeat(5, auto) minmax(80px, 100%)"
        gapX={gridGapX}
        gapY={gridGapY}
      >
        {!isAlpenglow && (
          <CuStatRow
            label="Vote"
            cus={stats.vote}
            totalCus={totalCus}
            maxCus={maxCus}
            pctColor={votesColor}
          />
        )}
        <CuStatRow
          label="Bundle"
          cus={stats.bundle}
          totalCus={totalCus}
          maxCus={maxCus}
          pctColor={bundleColor}
        />
        <CuStatRow
          label="Other"
          cus={stats.other}
          totalCus={totalCus}
          maxCus={maxCus}
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
  maxCus: number;
  pctColor: string;
}

function CuStatRow({ label, cus, totalCus, maxCus, pctColor }: CuStatRowProps) {
  const cuPctFromTotal = Math.round(totalCus ? (cus / totalCus) * 100 : 0);
  const cuPctFromMax = Math.round(maxCus ? (cus / maxCus) * 100 : 0);

  return (
    <>
      <Text className={styles.label}>{label}</Text>
      <Text className={styles.value} style={{ color: pctColor }} align="right">
        {cus.toLocaleString()}
      </Text>
      <Text className={styles.value}>/</Text>
      <Text
        className={styles.value}
        style={{ color: computeUnitsColor }}
        align="right"
      >
        {totalCus.toLocaleString()}
      </Text>
      <Text className={styles.value} align="right">
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
          width={`${cuPctFromMax}%`}
          opacity={0.6}
          fill={pctColor}
        />
      </svg>
    </>
  );
}
