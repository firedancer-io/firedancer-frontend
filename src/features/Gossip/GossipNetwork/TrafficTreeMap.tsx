import { useAtomValue } from "jotai";
import { gossipNetworkStatsAtom } from "../../../api/atoms";
import { TreeMap } from "@nivo/treemap";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import type { GossipNetworkTraffic } from "../../../api/types";
import { Flex, Switch, Text } from "@radix-ui/themes";

const colorsList = [
  "#00F0FF",
  "#00B5FF",
  "#5BFFFF",
  "#00FFD1",
  "#0EEAD5",
  //   "#FF6A00",
  //   "#FF3B00",
  //   "#FF2EF0",
  //   "#7B00FF",
  "#D9F8FF",
  //   "#67B873",
];

const size = 300;

export default function TrafficNetworkChartContainer() {
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const [dbNetworkStats] = useDebounce(networkStats, 5_000, {
    maxWait: 5_000,
  });

  const [includeAll, setIncludeAll] = useState(false);

  if (!dbNetworkStats) return;

  return (
    <div>
      <span>
        Include all (outside top 64)&nbsp;
        <Switch checked={includeAll} onCheckedChange={setIncludeAll} />
      </span>
      <Flex style={{ paddingTop: "50px" }}>
        <TrafficNetworkChart
          networkTraffic={dbNetworkStats.ingress}
          label="ingress"
          includeAll={includeAll}
        />
        <TrafficNetworkChart
          networkTraffic={dbNetworkStats.egress}
          label="egress"
          includeAll={includeAll}
        />
      </Flex>
    </div>
  );
}

interface TrafficeNetworkChartProps {
  networkTraffic: GossipNetworkTraffic;
  label: string;
  includeAll: boolean;
}

// const colors: Record<string, string> = {} satisfies Record<string, string>;

function TrafficNetworkChart({
  networkTraffic,
  label,
  includeAll,
}: TrafficeNetworkChartProps) {
  const data = useMemo(() => {
    if (!networkTraffic.peer_throughput) return;

    const threshold = 0.7;
    let currentTotal = 0;
    // const singleNodeThreshold = 0.005;
    let i = 0;
    const children = [];
    while (
      i < networkTraffic.peer_throughput.length &&
      //   networkTraffic.peer_throughput[i] /
      // (networkTraffic.total_throughput || 1) >
      // singleNodeThreshold
      currentTotal * threshold < (networkTraffic.total_throughput ?? 0)
    ) {
      const id =
        networkTraffic.peer_names?.[i] ||
        networkTraffic.peer_identities?.[i] ||
        "";

      const color = colorsList[Math.trunc(Math.random() * colorsList.length)];

      children.push({
        name: id,
        loc: networkTraffic.peer_throughput[i],
        color,
      });
      currentTotal += networkTraffic.peer_throughput[i];
      i++;
    }

    let restOfThroughput = 0;
    for (i; i < networkTraffic.peer_throughput.length; i++) {
      restOfThroughput += networkTraffic.peer_throughput[i];
    }

    children.push({
      name: "rest",
      loc: includeAll
        ? (networkTraffic.total_throughput ?? 0) - currentTotal
        : restOfThroughput,
      color: "#1CE7C2",
    });

    return {
      name: "peers",
      children: children,
      color: undefined,
    };
  }, [includeAll, networkTraffic]);

  if (!data) return;

  return (
    <Flex direction="column" align="center">
      <Text>{label}</Text>
      <TreeMap
        theme={{
          labels: { text: { fontSize: 14 } },
          tooltip: { container: { background: "black" } },
        }}
        animate={false}
        height={size}
        width={size}
        data={data}
        identity="name"
        value="loc"
        // label={(abc) => abc.id}
        valueFormat=".02s"
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        labelSkipSize={16}
        labelTextColor="black"
        // labelTextColor={{ from: "color", modifiers: [["darker", 1.2]] }}
        enableParentLabel={false}
        // parentLabelPosition="left"
        // parentLabelTextColor={{ from: "color", modifiers: [["darker", 2]] }}
        borderColor={{ from: "color", modifiers: [["darker", 1]] }}
        colors={(node) => node.data.color ?? "orange"}
      />
    </Flex>
  );
}
