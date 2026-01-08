import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { clientAtom } from "../../atoms.ts";
import { gossipNetworkStatsAtom } from "../../api/atoms.ts";
import StorageStatsTable from "./StorageStatsTable.tsx";
import StorageStatsCharts from "./StorageStatsCharts.tsx";
import MessageStatsTable from "./MessageStatsTable.tsx";
import PeerTable from "./PeerTable.tsx/index.tsx";
import StakeStatsChart from "./StakeStatsChart.tsx";
import GossipHealth from "./GossipHealth/index.tsx";
import { TrafficTreeMap } from "./TrafficTreeMap.tsx";
import { useDebounce } from "use-debounce";
import { rowGap, tableMinWidth } from "./consts.ts";

export default function Gossip() {
  const client = useAtomValue(clientAtom);
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const [dbNetworkStats] = useDebounce(networkStats, 5_000, {
    maxWait: 5_000,
  });

  const health = networkStats?.health;
  const storage = networkStats?.storage;

  if (client !== "Firedancer") return;
  if (!health || !storage || !dbNetworkStats) return;

  return (
    <Flex
      gap="30px"
      direction="column"
      align="stretch"
      justify="center"
      height="100%"
    >
      <Flex gapX="30px" gapY={rowGap} wrap="wrap">
        <TrafficTreeMap
          networkTraffic={dbNetworkStats.ingress}
          label="Ingress"
        />
        <TrafficTreeMap networkTraffic={dbNetworkStats.egress} label="Egress" />
      </Flex>

      <Flex gap="30px" wrap="wrap">
        <Flex
          direction="column"
          flexGrow="1"
          flexBasis="0"
          gap={rowGap}
          minWidth={tableMinWidth}
        >
          <StorageStatsCharts storage={storage} />
          <StorageStatsTable storage={storage} />
        </Flex>
        <Flex
          direction="column"
          flexGrow="1"
          flexBasis="0"
          gap={rowGap}
          minWidth={tableMinWidth}
        >
          <StakeStatsChart />
          <MessageStatsTable messages={networkStats.messages} />
        </Flex>
      </Flex>

      <GossipHealth health={health} />
      <PeerTable />
    </Flex>
  );
}
