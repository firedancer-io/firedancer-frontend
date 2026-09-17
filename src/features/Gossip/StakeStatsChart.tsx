import { Box, Flex, Grid, Text, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import {
  gossipPeerCountAtom,
  peerStatsAtom,
  totalNetworkStakeAtom,
} from "../../atoms";
import {
  totalValidatorsColor,
  nonDelinquentColor,
  headerColor,
  failureColor,
} from "../../colors";
import ValidatorStatsChart from "./ValidatorStatsChart";
import { formatNumberLamports } from "../Overview/ValidatorsCard/formatAmt";
import { StatCard } from "./StatCard";
import gossipStyles from "./gossip.module.css";

import {
  gridColumns,
  gridGap,
  gridMinWidth,
  headerGap,
  pieChartMinDiameter,
  statsCardPieChartGap,
} from "./consts";

export default function StakeStatsChart() {
  const peerStats = useAtomValue(peerStatsAtom);
  const gossipPeerCount = useAtomValue(gossipPeerCountAtom);
  const totalNetworkStake = useAtomValue(totalNetworkStakeAtom);

  const nonDelinquentLabel = peerStats
    ? formatNumberLamports(peerStats.nonDelinquentStake)
    : "--";
  const delinquentLabel = peerStats
    ? formatNumberLamports(peerStats.delinquentStake)
    : "--";

  return (
    <Flex direction="column" gap={headerGap}>
      <Tooltip content="Current epoch identity stakes in SOL. Known staked validators counts identities with positive mapped epoch stake; excluded identities are not counted. Gossip peers counts non-removed peers with gossip metadata, independently of voting status.">
        <Text className={gossipStyles.headerText}>Validator Stats</Text>
      </Tooltip>
      <Flex gap={statsCardPieChartGap} wrap="wrap">
        <Grid
          columns={gridColumns}
          minWidth={gridMinWidth}
          gap={gridGap}
          flexGrow="1"
          flexBasis="0"
        >
          <StatCard
            label="Known staked validators"
            value={
              peerStats?.knownStakedValidatorCount.toLocaleString() ?? "--"
            }
            valueColor={totalValidatorsColor}
          />
          <StatCard
            label="Non-delinquent Stake"
            value={nonDelinquentLabel}
            valueColor={nonDelinquentColor}
          />
          <StatCard
            label="Gossip peers"
            value={gossipPeerCount.toLocaleString()}
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
            nonDelinquentStake={peerStats?.nonDelinquentStake}
            delinquentStake={peerStats?.delinquentStake}
            totalNetworkStake={totalNetworkStake}
          />
        </Box>
      </Flex>
    </Flex>
  );
}
