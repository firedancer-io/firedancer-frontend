import { Box, Card, Flex } from "@radix-ui/themes";
import CardStat from "../../../components/CardStat";
import CardHeader from "../../../components/CardHeader";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../../atoms";
import { formatNumberLamports } from "./formatAmt";
import styles from "./validatorsCard.module.css";
import {
  failureColor,
  headerColor,
  nonDelinquentColor,
  totalValidatorsColor,
} from "../../../colors";

export default function ValidatorsCard() {
  const peerStats = useAtomValue(peerStatsAtom);
  if (!peerStats) return null;

  const activeLabel = formatNumberLamports(peerStats.activeStake);
  const delinquentLabel = formatNumberLamports(peerStats.delinquentStake);

  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Validators" />
        <Flex gap="2" flexGrow="1">
          <Flex direction="column" gap="2">
            <div className={styles.statRow}>
              <CardStat
                label="Total Validators"
                value={peerStats.validatorCount.toString()}
                valueColor={totalValidatorsColor}
                large
              />
              <CardStat
                label="Non-delinquent Stake"
                value={activeLabel}
                valueColor={nonDelinquentColor}
                appendValue="SOL"
                large
              />
            </div>
            <div className={styles.statRow}>
              <CardStat
                label="RPC Nodes"
                value={peerStats.rpcCount.toString()}
                valueColor={headerColor}
              />
              <CardStat
                label="Delinquent Stake"
                value={delinquentLabel}
                valueColor={failureColor}
                appendValue="SOL"
              />
            </div>
          </Flex>
          <Box style={{ minWidth: "200px" }}>
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
