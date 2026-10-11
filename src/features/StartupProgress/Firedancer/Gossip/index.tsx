import { Card, Flex, Text } from "@radix-ui/themes";
import bodyStyles from "../body.module.css";
import styles from "./gossip.module.css";
import { gossipNetworkStatsAtom } from "../../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatBytesAsBits } from "../../../../utils";
import { Bars } from "../Bars";
import PhaseHeader from "../PhaseHeader";
import { useDebounce } from "use-debounce";
import { formatNumberLamports } from "../../../Overview/ValidatorsCard/formatAmt";
import { gossipPeerCountAtom, peerStatsAtom } from "../../../../atoms";
import ConditionalTooltip from "../../../../components/ConditionalTooltip";
import { useEmaValue } from "../../../../hooks/useEma";
import { useOverallCompleteFraction } from "../useOverallCompleteFraction";

const MAX_THROUGHPUT_BYTES = 1_8750_000; // 150Mbit
const TOTAL_PEERS_COUNT = 5_000;

export default function Gossip() {
  const peersCount = useAtomValue(gossipPeerCountAtom);
  const peerStats = useAtomValue(peerStatsAtom);
  const phaseCompleteFraction = Math.min(peersCount / TOTAL_PEERS_COUNT, 1);
  const overallCompleteFraction = useOverallCompleteFraction(
    phaseCompleteFraction,
  );

  const peersCountRate = useEmaValue(peersCount);
  const remainingSeconds =
    peersCountRate === 0 ? undefined : TOTAL_PEERS_COUNT / peersCountRate;

  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const [dbNetworkStats] = useDebounce(networkStats, 100, {
    maxWait: 100,
  });

  const formattedConnectedStake = peerStats
    ? `${formatNumberLamports(peerStats.knownConnectedStake)} SOL`
    : "--";

  const ingressThroughput = dbNetworkStats
    ? formatBytesAsBits(dbNetworkStats.ingress.total_throughput)
    : undefined;
  const egressThroughput = dbNetworkStats
    ? formatBytesAsBits(dbNetworkStats.egress.total_throughput)
    : undefined;

  return (
    <>
      <PhaseHeader
        phaseCompleteFraction={phaseCompleteFraction}
        overallCompleteFraction={overallCompleteFraction}
        remainingSeconds={remainingSeconds}
      />

      <Flex
        mt="52px"
        direction="column"
        gap="20px"
        flexGrow="1"
        flexBasis="1"
        className={bodyStyles.startupContentIndentation}
      >
        <Flex justify="between" gap="20px" align="stretch" wrap="wrap">
          <GossipCard
            title="Gossip peers"
            value={peersCount.toLocaleString()}
            tooltip="Non-removed peers with gossip metadata, independently of stake and voting status."
          />
          <GossipCard
            title="Known staked peers"
            value={peerStats?.knownStakedPeerCount.toLocaleString()}
            tooltip="Gossip peers with positive mapped current epoch stake. Excluded identities are not counted."
          />
          <GossipCard
            title="Known connected stake"
            value={formattedConnectedStake}
            tooltip="Lower bound: mapped current epoch stake of non-removed peers with gossip metadata, regardless of voting status. Excluded stake cannot be assigned to connected identities, so coverage may be incomplete."
          />
        </Flex>

        <Flex direction="column" gap="10px">
          <Text className={styles.barTitle}>Ingress</Text>
          <Text className={styles.barValue}>
            {ingressThroughput
              ? `${ingressThroughput.value} ${ingressThroughput.unit}ps`
              : "-- Mbps"}
          </Text>
          <Bars
            value={dbNetworkStats?.ingress.total_throughput ?? 0}
            max={MAX_THROUGHPUT_BYTES}
          />
        </Flex>

        <Flex direction="column" gap="10px">
          <Text className={styles.barTitle}>Egress</Text>
          <Text className={styles.barValue}>
            {egressThroughput
              ? `${egressThroughput.value} ${egressThroughput.unit}ps`
              : "-- Mbps"}
          </Text>
          <Bars
            value={dbNetworkStats?.egress.total_throughput ?? 0}
            max={MAX_THROUGHPUT_BYTES}
          />
        </Flex>
      </Flex>
    </>
  );
}

interface GossipCardProps {
  title: string;
  value?: number | string | null;
  tooltip?: string;
}
function GossipCard({ title, value, tooltip }: GossipCardProps) {
  return (
    <ConditionalTooltip content={tooltip}>
      <Card className={styles.card}>
        <Text>{title}</Text>
        <Text className={styles.value}>{value ?? "--"}</Text>
      </Card>
    </ConditionalTooltip>
  );
}
