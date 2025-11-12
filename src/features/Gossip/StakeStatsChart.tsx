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

export default function StakeStatsChart() {
  {
    const peerStats = useAtomValue(peerStatsAtom);
    if (!peerStats) return null;

    const activeLabel = formatNumberLamports(peerStats.activeStake);
    const delinquentLabel = formatNumberLamports(peerStats.delinquentStake);

    return (
      <Flex gap="1" direction="column">
        <Text size="4">Validator Stats</Text>
        <Flex align="stretch" justify="between" gap="2">
          {/* TODO fix do avoid 3x1 */}
          <Grid
            columns="repeat(auto-fit, minmax(200px, 1fr)"
            gap="4"
            flexGrow=".6"
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

          <Box minWidth="100px" minHeight="100px" flexGrow="1">
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
