import { Flex, Grid } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { clientAtom } from "../../atoms.ts";
import { gossipNetworkStatsAtom } from "../../api/atoms.ts";
import StorageStatsTable from "./StorageStatsTable.tsx";
import StorageStatsCharts from "./StorageStatsCharts.tsx";
import MessageStatsTable from "./MessageStatsTable.tsx";
import { bootProgressPhaseAtom } from "../StartupProgress/atoms.ts";
import PeerTable from "./PeerTable.tsx/index.tsx";
import StakeStatsChart from "./StakeStatsChart.tsx";
import GossipHealth from "./GossipHealth.tsx";
import { TrafficTreeMap } from "./TrafficTreeMap.tsx";
import { useDebounce } from "use-debounce";

export default function Gossip() {
  const client = useAtomValue(clientAtom);
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const [dbNetworkStats] = useDebounce(networkStats, 5_000, {
    maxWait: 5_000,
  });

  const health = networkStats?.health;
  const storage = networkStats?.storage;
  const phase = useAtomValue(bootProgressPhaseAtom);
  const key = phase === "running" ? "running" : "startup";

  if (client !== "Firedancer") return;
  if (!health || !storage || !dbNetworkStats) return;

  return (
    <Flex
      gap="6"
      direction="column"
      align="stretch"
      justify="center"
      mx="4"
      height="100%"
    >
      <Grid
        columns="repeat(auto-fit, minmax(min(100%, 600px), 1fr))"
        gapX="6"
        gapY="6"
        key={key}
      >
        <TrafficTreeMap
          networkTraffic={dbNetworkStats.ingress}
          label="Ingress Peers"
        />
        <TrafficTreeMap
          networkTraffic={dbNetworkStats.egress}
          label="Egress Peers"
        />
        <StorageStatsCharts storage={storage} />
        <StakeStatsChart />
        <StorageStatsTable storage={storage} />
        <MessageStatsTable messages={networkStats.messages} />
      </Grid>
      <GossipHealth health={health} />
      <PeerTable />
    </Flex>
  );
}
