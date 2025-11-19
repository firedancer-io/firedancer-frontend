import { Box, Flex, Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../atoms";
import {
  totalValidatorsColor,
  nonDelinquentColor,
  headerColor,
  failureColor,
} from "../../colors";
import ValidatorStatsChart from "./ValidatorStatsChart";
import { formatNumberLamports } from "../Overview/ValidatorsCard/formatAmt";
import { StatCard } from "./StatCard";
import styles from "./pieChart.module.css";
import {
  gridColumns,
  gridGap,
  gridMinWidth,
  headerGap,
  pieChartMinDiameter,
  statsCardPieChartGap,
} from "./consts";

export default function StakeStatsChart() {
  {
    const peerStats = useAtomValue(peerStatsAtom);
    if (!peerStats) return null;

    const activeLabel = formatNumberLamports(peerStats.activeStake);
    const delinquentLabel = formatNumberLamports(peerStats.delinquentStake);

    return (
      <Flex direction="column" gap={headerGap}>
        <Text className={styles.headerText}>Validator Stats</Text>
        <Flex gap={statsCardPieChartGap} wrap="wrap">
          <Grid
            columns={gridColumns}
            minWidth={gridMinWidth}
            gap={gridGap}
            flexGrow="1"
            flexBasis="0"
          >
            <StatCard
              label="Total Validators"
              value={peerStats.validatorCount.toLocaleString()}
              valueColor={totalValidatorsColor}
            />
            <StatCard
              label="Non-delinquent Stake"
              value={activeLabel}
              valueColor={nonDelinquentColor}
            />
            <StatCard
              label="RPC Nodes"
              value={peerStats.rpcCount.toLocaleString()}
              valueColor={headerColor}
            />
            <StatCard
              label="Delinquent Stake"
              value={delinquentLabel}
              valueColor={failureColor}
            />
          </Grid>

          <Box
            minWidth={pieChartMinDiameter}
            minHeight={pieChartMinDiameter}
            flexGrow="1"
            flexBasis="0"
          >
            <ValidatorStatsChart
              activeStake={peerStats.activeStake}
              delinquentStake={peerStats.delinquentStake}
            />
          </Box>
        </Flex>
      </Flex>
    );
  }
}
