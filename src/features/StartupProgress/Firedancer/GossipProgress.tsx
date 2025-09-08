import { Card, Flex, Text } from "@radix-ui/themes";

import styles from "./gossip.module.css";
import { Bars } from "./Bars";

export function GossipProgress() {
  // TODO: use atom
  return (
    <Flex gapX="162px">
      <Flex direction="column" gap="20px">
        <Flex justify="between" gap="20px" align="stretch">
          <GossipCard title="Staked Peers" value={0} />
          <GossipCard title="Unstaked Peers" value={0} />
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
  value: number;
}
function GossipCard({ title, value }: GossipCardProps) {
  return (
    <Card className={styles.card}>
      <Text>{title}</Text>
      <Text className={styles.value}>{value}</Text>
    </Card>
  );
}
