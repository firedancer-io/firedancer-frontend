import { Box, Card, Flex } from "@radix-ui/themes";
import CardStat from "../../../components/CardStat";
import CardHeader from "../../../components/CardHeader";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../../atoms";
import { formatNumberLamports } from "./formatAmt";
import styles from "./validatorsCard.module.css";

export default function ValidatorsCard() {
  const peerStats = useAtomValue(peerStatsAtom);
  if (!peerStats) return null;

  const activeLabel = formatNumberLamports(peerStats.activeStake);
  const delinquentLabel = formatNumberLamports(peerStats.delinquentStake);

  return (
    <Card>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Validators" />
        <Flex gap="2" flexGrow="1">
          <Flex direction="column" gap="2">
            <div className={styles.statRow}>
              <CardStat
                label="Total Validators"
                value={peerStats.validatorCount.toString()}
                valueColor="#20788C"
                large
              />
              <CardStat
                label="Non-delinquent Stake"
                value={activeLabel}
                valueColor="#6F77C0"
                appendValue="SOL"
                large
              />
            </div>
            <div className={styles.statRow}>
              <CardStat
                label="RPC Nodes"
                value={peerStats.rpcCount.toString()}
                valueColor="#BDF3FF"
              />
              <CardStat
                label="Delinquent Stake"
                value={delinquentLabel}
                valueColor="#FF3C3C"
                appendValue="SOL"
              />
            </div>
          </Flex>
          <Box flexGrow="1" style={{ minWidth: "200px" }}>
            <Chart
              activeStake={peerStats.activeStake}
              delinquentStake={peerStats.delinquentStake}
            />
          </Box>
        </Flex>
      </Flex>
    </Card>
  );
}
