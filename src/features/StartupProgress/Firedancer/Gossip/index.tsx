import { Card, Flex, Text } from "@radix-ui/themes";
import bodyStyles from "../body.module.css";
import styles from "./gossip.module.css";
import { gossipNetworkStatsAtom } from "../../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatBytesAsBits } from "../../../../utils";
import { Bars } from "../Bars";
import PhaseHeader from "../PhaseHeader";
import { useDebounce } from "use-debounce";
import { lamportsPerSol } from "../../../../consts";
import { compactZeroDecimalFormatter } from "../../../../numUtils";
import { peersCountAtom } from "../../../../atoms";
import { useEmaValue } from "../../../../hooks/useEma";

const MAX_THROUGHPUT_BYTES = 1_8750_000; // 150Mbit
const TOTAL_PEERS_COUNT = 5_000;

export default function Gossip() {
  const peersCount = useAtomValue(peersCountAtom);
  const phaseCompletePct = (peersCount / TOTAL_PEERS_COUNT) * 100;
  const peersCountRate = useEmaValue(peersCount);
  const remainingSeconds =
    peersCountRate === 0 ? undefined : TOTAL_PEERS_COUNT / peersCountRate;

  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const [dbNetworkStats] = useDebounce(networkStats, 100, {
    maxWait: 100,
  });

  if (!dbNetworkStats) return null;

  const { health, ingress, egress } = dbNetworkStats;

  const solConnectedStake = Number(health.connected_stake) / lamportsPerSol;
  const formattedConnectedStake =
    compactZeroDecimalFormatter.format(solConnectedStake);

  const ingressThroughput = formatBytesAsBits(ingress.total_throughput);
  const egressThroughput = formatBytesAsBits(egress.total_throughput);

  return (
    <>
      <PhaseHeader
        phase="joining_gossip"
        phaseCompletePct={phaseCompletePct}
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
            title="Staked Peers"
            value={health.connected_staked_peers.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          />
          <GossipCard
            title="Unstaked Peers"
            value={health.connected_unstaked_peers.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          />
          <GossipCard title="Connected Stake" value={formattedConnectedStake} />
        </Flex>

        <Flex direction="column" gap="10px">
          <Text className={styles.barTitle}>Ingress</Text>
          <Text className={styles.barValue}>
            {ingressThroughput
              ? `${ingressThroughput.value} ${ingressThroughput.unit}ps`
              : "-- Mbps"}
          </Text>
          <Bars
            value={ingress.total_throughput ?? 0}
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
            value={egress.total_throughput ?? 0}
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
}
function GossipCard({ title, value }: GossipCardProps) {
  return (
    <Card className={styles.card}>
      <Text>{title}</Text>
      <Text className={styles.value}>{value ?? "--"}</Text>
    </Card>
  );
}
