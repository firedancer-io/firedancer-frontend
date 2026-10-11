import { Flex, Box, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import {
  gossipPeerCountAtom,
  peerStatsAtom,
  totalNetworkStakeAtom,
} from "../../../atoms";
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
  const gossipPeerCount = useAtomValue(gossipPeerCountAtom);
  const totalNetworkStake = useAtomValue(totalNetworkStakeAtom);

  const nonDelinquentLabel = peerStats
    ? formatNumberLamports(peerStats.nonDelinquentStake)
    : "--";
  const delinquentLabel = peerStats
    ? formatNumberLamports(peerStats.delinquentStake)
    : "--";

  return (
    <Flex gap="2" flexGrow="1" wrap="wrap">
      <Flex
        direction="column"
        gap="2"
        minWidth="0"
        flexGrow="1"
        flexBasis="240px"
      >
        <div className={styles.statRow}>
          <Tooltip content="Identities with positive mapped current epoch stake. Excluded identities are not counted; peer metadata and connectivity are not required.">
            <div>
              <CardStat
                label="Known staked validators"
                value={
                  peerStats?.knownStakedValidatorCount.toLocaleString() ?? "--"
                }
                valueColor={totalValidatorsColor}
                valueSize="medium"
              />
            </div>
          </Tooltip>
          <CardStat
            label="Non-delinquent Stake"
            value={nonDelinquentLabel}
            valueColor={nonDelinquentColor}
            appendValue={peerStats ? "SOL" : undefined}
            valueSize="medium"
          />
        </div>
        <div className={styles.statRow}>
          <Tooltip content="Non-removed peers with gossip metadata, independently of stake and voting status.">
            <div>
              <CardStat
                label="Gossip peers"
                value={gossipPeerCount.toLocaleString()}
                valueColor={headerColor}
                valueSize="small"
              />
            </div>
          </Tooltip>
          <CardStat
            label="Delinquent Stake"
            value={delinquentLabel}
            valueColor={failureColor}
            appendValue={peerStats ? "SOL" : undefined}
            valueSize="small"
          />
        </div>
      </Flex>
      <Box minWidth="200px" minHeight="200px" flexGrow="1" flexBasis="200px">
        <Chart
          nonDelinquentStake={peerStats?.nonDelinquentStake}
          delinquentStake={peerStats?.delinquentStake}
          totalNetworkStake={totalNetworkStake}
        />
      </Box>
    </Flex>
  );
}
