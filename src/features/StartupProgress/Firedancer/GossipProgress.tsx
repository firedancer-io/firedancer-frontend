import { Card, Flex, Text } from "@radix-ui/themes";

import styles from "./gossip.module.css";
import { Bars } from "./Bars";
import { useAtomValue } from "jotai";
import { gossipNetworkStatsAtom } from "../../../api/atoms";

export function GossipProgress() {
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  if (!networkStats) return null;

  const { health } = networkStats;

  return (
    <Flex gapX="162px">
      <Flex direction="column" gap="20px">
        <Flex justify="between" gap="20px" align="stretch">
          <GossipCard
            title="Staked Peers"
            value={health.connected_staked_peers ?? null}
          />
          <GossipCard
            title="Unstaked Peers"
            value={health.connected_unstaked_peers ?? null}
          />
          <GossipCard title="Snapshot Peers" value={0} />
        </Flex>

        <Bars title="Ingress" value={19} max={20} />
        <Bars title="Egress" value={5} max={20} />
      </Flex>
      <Text>Stake Discovered</Text>
    </Flex>
  );
}

interface GossipCardProps {
  title: string;
  value: number | null;
}
function GossipCard({ title, value }: GossipCardProps) {
  return (
    <Card className={styles.card}>
      <Text>{title}</Text>
      <Text className={styles.value}>{value ?? "--"}</Text>
    </Card>
  );
}
