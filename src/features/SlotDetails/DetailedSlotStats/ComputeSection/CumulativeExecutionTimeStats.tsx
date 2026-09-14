import { Grid, Text } from "@radix-ui/themes";
import { useContext } from "react";
import { getDurationWithUnits } from "../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import PctBar from "../PctBar";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import styles from "../detailedSlotStats.module.css";
import clsx from "clsx";
import MonoText from "../../../../components/MonoText";
import { gridGapX, gridGapY } from "../consts";
import { TxnState } from "../../../Overview/SlotPerformance/TransactionBarsCard/consts";
import { isFiredancer } from "../../../../client";
import { SlotTransactionsContext } from "../../SlotTransactionsContext";

export default function CumulativeExecutionTimeStats() {
  const transactionsInfo = useContext(SlotTransactionsContext);
  if (!transactionsInfo) return;

  const { unlanded, landedSuccess, landedFailed, max } =
    transactionsInfo.landedStateDurations;

  return (
    <SlotDetailsSubSection title="Cumulative Execution Time">
      <Grid columns="repeat(7, auto)" gapX={gridGapX} gapY={gridGapY}>
        <div />
        <Text className={styles.tableHeader} style={{ gridColumn: "span 2" }}>
          Success+Landed
        </Text>
        <Text className={styles.tableHeader} style={{ gridColumn: "span 2" }}>
          Failed+Landed
        </Text>
        <Text className={styles.tableHeader} style={{ gridColumn: "span 2" }}>
          Unlanded
        </Text>
        <Row
          label="Preloading"
          landedSuccess={landedSuccess.preLoading}
          landedFailed={landedFailed.preLoading}
          unlanded={unlanded.preLoading}
          max={max}
        />
        {isFiredancer ? (
          <>
            <Row
              label={TxnState.LOADING}
              landedSuccess={landedSuccess.loading}
              landedFailed={landedFailed.loading}
              unlanded={unlanded.loading}
              max={max}
            />
            <Row
              label={TxnState.VALIDATE}
              landedSuccess={landedSuccess.validating}
              landedFailed={landedFailed.validating}
              unlanded={unlanded.validating}
              max={max}
            />
          </>
        ) : (
          <>
            <Row
              label={TxnState.VALIDATE}
              landedSuccess={landedSuccess.validating}
              landedFailed={landedFailed.validating}
              unlanded={unlanded.validating}
              max={max}
            />
            <Row
              label={TxnState.LOADING}
              landedSuccess={landedSuccess.loading}
              landedFailed={landedFailed.loading}
              unlanded={unlanded.loading}
              max={max}
            />
          </>
        )}
        <Row
          label="Execute"
          landedSuccess={landedSuccess.execute}
          landedFailed={landedFailed.execute}
          unlanded={unlanded.execute}
          max={max}
        />
        <Row
          label="Post-Execute"
          landedSuccess={landedSuccess.postExecute}
          landedFailed={landedFailed.postExecute}
          unlanded={unlanded.postExecute}
          max={max}
        />
        <Row
          label="Total"
          landedSuccess={landedSuccess.total}
          landedFailed={landedFailed.total}
          unlanded={unlanded.total}
          max={max}
          isTotal
        />
      </Grid>
    </SlotDetailsSubSection>
  );
}

interface RowProps {
  label: string;
  landedSuccess: number;
  landedFailed: number;
  unlanded: number;
  max: number;
  isTotal?: boolean;
}

function Row({
  label,
  landedSuccess,
  landedFailed,
  unlanded,
  max,
  isTotal,
}: RowProps) {
  const landedSuccessColor = isTotal ? "#28684A" : "#174933";
  const landedFailedColor = isTotal ? "#8C333A" : "#611623";
  const unlandedColor = isTotal ? "#12677E" : "#004558";

  const landedSuccessUnits = getDurationWithUnits(landedSuccess);
  const landedFailedUnits = getDurationWithUnits(landedFailed);
  const unlandedUnits = getDurationWithUnits(unlanded);

  return (
    <>
      <Text className={clsx(styles.tableRowLabel, isTotal && styles.total)}>
        {label}
      </Text>
      <Text
        className={clsx(styles.tableCellValue, isTotal && styles.total)}
        align="right"
      >
        {landedSuccessUnits.value}
        <MonoText>{landedSuccessUnits.unit}</MonoText>
      </Text>
      <PctBar
        value={landedSuccess}
        total={max}
        valueColor={landedSuccessColor}
      />
      <Text
        className={clsx(styles.tableCellValue, isTotal && styles.total)}
        align="right"
      >
        {landedFailedUnits.value}
        <MonoText>{landedFailedUnits.unit}</MonoText>
      </Text>
      <PctBar value={landedFailed} total={max} valueColor={landedFailedColor} />
      <Text
        className={clsx(styles.tableCellValue, isTotal && styles.total)}
        align="right"
      >
        {unlandedUnits.value}
        <MonoText>{unlandedUnits.unit}</MonoText>
      </Text>
      <PctBar value={unlanded} total={max} valueColor={unlandedColor} />
    </>
  );
}
