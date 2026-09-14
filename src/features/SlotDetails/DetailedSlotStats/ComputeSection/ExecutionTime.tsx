import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { isAlpenglowAtom } from "../../../../api/atoms";
import { nonVoteColor, votesColor } from "../../../../colors";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import MonoText from "../../../../components/MonoText";
import styles from "../detailedSlotStats.module.css";
import { gridGapX, gridGapY } from "../consts";
import { useSlotTransactionsContext } from "../../SlotTransactionsContext";

export default function ExecutionTime() {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const transactionsInfo = useSlotTransactionsContext();

  if (!transactionsInfo) return;

  const {
    vote,
    voteMin,
    voteMax,
    nonVote,
    nonVoteMin,
    nonVoteMax,
    bundle,
    bundleMin,
    bundleMax,
    max,
  } = transactionsInfo.txnStateDurations;

  return (
    <SlotDetailsSubSection title="Execution Time (min / avg / max)">
      <Grid columns="repeat(7, auto)" gapX={gridGapX} gapY={gridGapY}>
        {!isAlpenglow && (
          <Row
            label="Vote"
            value={vote}
            color={votesColor}
            max={max}
            minValue={voteMin}
            maxValue={voteMax}
          />
        )}
        <Row
          label={isAlpenglow ? "Transaction" : "Non-vote"}
          value={nonVote}
          color={nonVoteColor}
          max={max}
          minValue={nonVoteMin}
          maxValue={nonVoteMax}
        />
        <Row
          label="Bundle"
          value={bundle}
          color="var(--purple-9)"
          max={max}
          minValue={bundleMin}
          maxValue={bundleMax}
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
  const hasData = isFinite(value) && isFinite(minValue) && isFinite(maxValue);

  const pct = hasData ? (value / max) * 100 : 0;
  const minPct = hasData ? (minValue / max) * 100 : 0;
  const maxPct = hasData ? (maxValue / max) * 100 : 0;

  const formatted = hasData ? getDurationWithUnits(value) : null;
  const minFormatted = hasData ? getDurationWithUnits(minValue) : null;
  const maxFormatted = hasData ? getDurationWithUnits(maxValue) : null;

  return (
    <>
      <Text className={styles.label}>{label}</Text>
      <Text className={styles.value} style={{ color: "#6E56CF" }} align="right">
        {minFormatted ? (
          <>
            {minFormatted.value}
            <MonoText>{minFormatted.unit}</MonoText>
          </>
        ) : (
          "-"
        )}
      </Text>
      <Text className={styles.value}>/</Text>
      <Text className={styles.value} style={{ color: "#BAA7FF" }} align="right">
        {formatted ? (
          <>
            {formatted.value}
            <MonoText>{formatted.unit}</MonoText>
          </>
        ) : (
          "-"
        )}
      </Text>
      <Text className={styles.value}>/</Text>
      <Text className={styles.value} style={{ color: "#6E56CF" }} align="right">
        {maxFormatted ? (
          <>
            {maxFormatted.value}
            <MonoText>{maxFormatted.unit}</MonoText>
          </>
        ) : (
          "-"
        )}
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
