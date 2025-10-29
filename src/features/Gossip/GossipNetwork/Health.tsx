import { useAtomValue } from "jotai";
import { Bars } from "../../StartupProgress/Firedancer/Bars";
import { gossipNetworkStatsAtom } from "../../../api/atoms";
import { Flex, Grid, Text } from "@radix-ui/themes";
import { Pie } from "@nivo/pie";
import { useMemo } from "react";
import type { GossipNetworkHealth } from "../../../api/types";
import { formatNumberLamports } from "../../Overview/ValidatorsCard/formatAmt";
import { sum } from "lodash";

export default function Health() {
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const health = networkStats?.health;

  if (!health) return null;

  return (
    <Flex>
      <Flex direction="column">
        <Text>
          Connected stake: {formatNumberLamports(health.connected_stake)} SOL
        </Text>
        <Text>
          Staked ({health.connected_staked_peers}) vs unstaked (
          {health.connected_unstaked_peers})
        </Text>
        <ConnectedPeersPieChart health={health} />
      </Flex>
      <Flex direction="column" gap="1">
        <Bar
          label="Pull Response entries"
          values={[
            health.num_pull_response_entries_rx_success,
            health.num_pull_response_entries_rx_failure,
            health.num_pull_response_entries_rx_duplicate,
          ]}
        />
        <Bar
          label="Pull Response messages"
          values={[
            health.num_pull_response_messages_rx_success,
            health.num_pull_response_messages_rx_failure,
            0,
          ]}
        />
        <Bar
          label="Push Entries rx"
          values={[
            health.num_push_entries_rx_success,
            health.num_push_entries_rx_failure,
            health.num_push_entries_rx_duplicate,
          ]}
        />
        <Bar
          label="Push messages rx"
          values={[
            health.num_push_messages_rx_success,
            health.num_push_messages_rx_failure,
            0,
          ]}
        />
      </Flex>
    </Flex>
  );
}

interface BarProps {
  label: string;
  values: [number, number, number];
}

function Bar({ label, values }: BarProps) {
  const pcts = useMemo(() => {
    const total = sum(values);
    return values.map((value) => (value / total) * 100);
  }, [values]);

  return (
    <Flex direction="column">
      <Text>{label}</Text>
      <svg
        height="8"
        width="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center" }}
      >
        <rect height="8" width={`${pcts[0]}%`} opacity={0.6} fill={"green"} />
        <rect
          height="8"
          width={`${pcts[1]}%`}
          x={`${pcts[0]}%`}
          opacity={0.6}
          fill={"red"}
        />
        <rect
          height="8"
          width={`${pcts[2]}%`}
          x={`${pcts[0] + pcts[1]}%`}
          opacity={0.6}
          fill={"blue"}
        />
      </svg>
    </Flex>
  );
}

interface ConnectedPeersPieChartProps {
  health: GossipNetworkHealth;
}

function ConnectedPeersPieChart({ health }: ConnectedPeersPieChartProps) {
  const data = useMemo(() => {
    return [
      {
        id: "staked",
        label: "staked",
        value: Number(health.connected_staked_peers),
      },
      {
        id: "unstaked",
        label: "unstaked",
        value: Number(health.connected_unstaked_peers),
      },
    ];
  }, [health]);

  return (
    <Pie
      height={300}
      width={300}
      data={data}
      // colors={{ datum: "data.color" }}
      enableArcLabels={true}
      enableArcLinkLabels={true}
      layers={["arcs"]}
      // tooltip={Tooltip}
      animate={false}
      innerRadius={0.7}
    />
  );
}
