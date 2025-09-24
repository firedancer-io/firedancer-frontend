import { Card, Flex, Text } from "@radix-ui/themes";

import styles from "./gossip.module.css";
import { Bars } from "./Bars";
import { useAtomValue } from "jotai";
import { gossipNetworkStatsAtom } from "../../../api/atoms";
import { formatBytesAsBits, getFmtStake } from "../../../utils";

const MAX_THROUGHPUT_BYTES = 1_8750_000; // 150Mbit

export function GossipProgress() {
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  if (!networkStats) return null;

  const { health, ingress, egress } = networkStats;

  const connectedStake =
    health.connected_stake == null ? null : getFmtStake(health.connected_stake);

  const ingressThroughput =
    ingress.total_throughput == null
      ? undefined
      : formatBytesAsBits(ingress.total_throughput);

  const egressThroughput =
    egress.total_throughput == null
      ? undefined
      : formatBytesAsBits(egress.total_throughput);

  return (
    <Flex gapX="162px">
      <Flex direction="column" gap="20px">
        <Flex justify="between" gap="20px" align="stretch">
          <GossipCard
            title="Staked Peers"
            value={health.connected_staked_peers}
          />
          <GossipCard
            title="Unstaked Peers"
            value={health.connected_unstaked_peers}
          />
          <GossipCard title="Connected Stake" value={connectedStake} />
        </Flex>

        <Flex direction="column" gap="10px">
          <Text className={styles.barTitle}>Ingress</Text>
          <Text className={styles.barValue}>
            {ingressThroughput
              ? `${ingressThroughput.value} ${ingressThroughput.unit}`
              : "-- Mbit"}
          </Text>
          <Bars
            title="Ingress"
            value={ingress.total_throughput ?? 0}
            max={MAX_THROUGHPUT_BYTES}
          />
        </Flex>

        <Flex direction="column" gap="10px">
          <Text className={styles.barTitle}>Egress</Text>
          <Text className={styles.barValue}>
            {egressThroughput
              ? `${egressThroughput.value} ${egressThroughput.unit}`
              : "-- Mbit"}
          </Text>
          <Bars
            title="Egress"
            value={egress.total_throughput ?? 0}
            max={MAX_THROUGHPUT_BYTES}
          />
        </Flex>
      </Flex>
      <Text>Stake Discovered</Text>
    </Flex>
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
