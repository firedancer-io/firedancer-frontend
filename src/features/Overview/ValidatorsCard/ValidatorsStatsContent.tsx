import { Flex, Box } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../../atoms";
import {
  totalValidatorsColor,
  nonDelinquentColor,
  headerColor,
  failureColor,
} from "../../../colors";
import CardStat from "../../../components/CardStat";
import Chart from "../../Gossip/ValidatorStatsChart";
import { formatNumberLamports } from "./formatAmt";
import styles from "./validatorsCard.module.css";

export default function ValidatorsStatsContent() {
  const peerStats = useAtomValue(peerStatsAtom);
  if (!peerStats) return null;

  const activeLabel = formatNumberLamports(peerStats.activeStake);
  const delinquentLabel = formatNumberLamports(peerStats.delinquentStake);

  return (
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
  );
}
