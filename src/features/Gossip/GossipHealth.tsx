import { Box, Card, Flex, Grid, Text } from "@radix-ui/themes";
import { StatCardContent } from "./StatCard";
import type { GossipNetworkHealth } from "../../api/types";
import { useEmaValue } from "../../hooks/useEma";
import { useMemo, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { useHarmonicIntervalFn } from "react-use";
import { clamp, sum } from "lodash";
import { Sparkline } from "../Overview/SlotPerformance/TileSparkLine";
import { tileBusyGreenColor, tileBusyRedColor } from "../../colors";

const pushColor = "#30A46C";
const pullColor = "#A39073";
const failColor = "#E5484D";
const dupeColor = "#3E63DD";

interface GossipHealthProps {
  health: GossipNetworkHealth;
}

export default function GossipHealth({ health }: GossipHealthProps) {
  return (
    <Flex gap="2">
      <Flex direction="column" flexGrow="1" gap="2">
        <TotalEntriesCard health={health} />
        <TotalMessagesCard health={health} />
      </Flex>
      <Flex direction="column" flexGrow="1" gap="2">
        <DuplicateCard health={health} />
        <FailureCard health={health} />
      </Flex>
      <Flex direction="column" flexGrow="1" gap="2">
        <PushCard health={health} />
        <PullCard health={health} />
      </Flex>
    </Flex>
  );
}

function DuplicateCard({ health }: GossipHealthProps) {
  return (
    <Card>
      <Grid columns="auto 1fr" gapX="6" gapY="3">
        <PushDuplicateStats health={health} />
        <PullDuplicateStats health={health} />
      </Grid>
    </Card>
  );
}

function FailureCard({ health }: GossipHealthProps) {
  return (
    <Card>
      <Grid columns="auto 1fr" gapX="6" gapY="3">
        <PushFailureStats health={health} />
        <PullFailureStats health={health} />
      </Grid>
    </Card>
  );
}

function PushDuplicateStats({ health }: GossipHealthProps) {
  const total = useEmaValue(
    health.num_push_entries_rx_success + health.num_push_entries_rx_failure,
  );
  const dupe = useEmaValue(health.num_push_entries_rx_duplicate);

  return (
    <SparkLineCard
      label="Push Duplicate /s"
      value={dupe}
      total={total}
      color={dupeColor}
    />
  );
}

function PullDuplicateStats({ health }: GossipHealthProps) {
  const total = useEmaValue(
    health.num_pull_response_entries_rx_success +
      health.num_pull_response_entries_rx_failure,
  );
  const dupe = useEmaValue(health.num_pull_response_entries_rx_duplicate);

  return (
    <SparkLineCard
      label="Pull Duplicate /s"
      value={dupe}
      total={total}
      color={dupeColor}
    />
  );
}

function PushFailureStats({ health }: GossipHealthProps) {
  const total = useEmaValue(
    health.num_push_entries_rx_success + health.num_push_entries_rx_failure,
  );
  const value = useEmaValue(
    health.num_push_entries_rx_failure - health.num_push_entries_rx_duplicate,
  );

  return (
    <SparkLineCard
      label="Push Failure /s"
      value={value}
      total={total}
      color={failColor}
    />
  );
}

function PullFailureStats({ health }: GossipHealthProps) {
  const total = useEmaValue(
    health.num_pull_response_entries_rx_success +
      health.num_pull_response_entries_rx_failure,
  );
  const value = useEmaValue(
    health.num_pull_response_entries_rx_failure -
      health.num_pull_response_entries_rx_duplicate,
  );

  return (
    <SparkLineCard
      label="Pull Failure /s"
      value={value}
      total={total}
      color={failColor}
    />
  );
}

interface SparkLineCardProps {
  label: string;
  value: number;
  total: number;
  color?: string;
}

function SparkLineCard({ label, value, total, color }: SparkLineCardProps) {
  let pct = value / total;
  if (!isFinite(pct)) pct = 0;
  const formattedPct = `${Math.trunc(pct * 100).toLocaleString()}%`;

  return (
    <>
      <Flex align="end" justify="between" minWidth="170px">
        <StatCardContent
          label={label}
          value={Math.trunc(value)}
          valueColor={color}
          size="sm"
        />
        <Text
          style={{
            color: `color-mix(in srgb, ${tileBusyGreenColor}, ${tileBusyRedColor} ${pct * 100}%)`,
            margin: "4px 0",
          }}
        >
          {formattedPct ?? "-"}
        </Text>
      </Flex>
      <SparkLine pct={pct} />
    </>
  );
}

interface SparkLineProps {
  pct: number;
}

function SparkLine({ pct }: SparkLineProps) {
  const sizeRefs = useRef<{ height: number; width: number }>();
  const [chartData, setChartData] = useState<number[]>([]);

  useHarmonicIntervalFn(() => {
    setChartData((prev) => {
      let chartData = [...prev];
      if (prev.length > bufferMax) {
        chartData = chartData.slice(chartData.length - bufferMax);
      }
      chartData.push(1 - pct);
      return chartData;
    });
  }, updateInterval);

  const scaledPoints = useMemo(() => {
    if (!sizeRefs.current) return;
    if (!chartData.length) return;

    const { height, width } = sizeRefs.current;
    const maxLength = chartData.length;
    const xRatio = width / maxLength;
    const yRatio = height - 10;

    return chartData.map((pct, i) => ({ x: i * xRatio, y: pct * yRatio + 5 }));
  }, [chartData]);

  return (
    <Box flexGrow="1">
      <AutoSizer>
        {({ height, width }) => {
          sizeRefs.current = { height, width };
          if (!scaledPoints) return null;
          return (
            <Box height={`${height}px`} width={`${width}px`}>
              <Sparkline height={height} scaledDataPoints={scaledPoints} />
            </Box>
          );
        }}
      </AutoSizer>
    </Box>
  );
}

function TotalEntriesCard({ health }: GossipHealthProps) {
  const total = useEmaValue(
    health.num_push_entries_rx_success +
      health.num_pull_response_entries_rx_success,
  );
  const push = useEmaValue(health.num_push_entries_rx_success);
  const pull = useEmaValue(health.num_pull_response_entries_rx_success);

  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex gap="6">
        <Flex direction="column">
          <StatCardContent
            label="Entries /s"
            value={Math.trunc(total).toLocaleString()}
          />
          <Flex gap="3">
            <StatCardContent
              label="Push /s"
              value={Math.trunc(push).toLocaleString()}
              valueColor="var(--green-9)"
              size="sm"
            />
            <StatCardContent
              label="Pull /s"
              value={Math.trunc(pull).toLocaleString()}
              valueColor="var(--gold-10)"
              size="sm"
            />
          </Flex>
        </Flex>
        <SvgPctChart values={[pull, push]} colors={[pullColor, pushColor]} />
      </Flex>
    </Card>
  );
}

function TotalMessagesCard({ health }: GossipHealthProps) {
  const total = useEmaValue(
    health.num_push_messages_rx_success +
      health.num_pull_response_messages_rx_success,
  );
  const push = useEmaValue(health.num_push_messages_rx_success);
  const pull = useEmaValue(health.num_pull_response_messages_rx_success);

  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex gap="6">
        <Flex direction="column">
          <StatCardContent
            label="Messages /s"
            value={Math.trunc(total).toLocaleString()}
          />
          <Flex gap="3">
            <StatCardContent
              label="Push /s"
              value={Math.trunc(push).toLocaleString()}
              valueColor="var(--green-9)"
              size="sm"
            />
            <StatCardContent
              label="Pull /s"
              value={Math.trunc(pull).toLocaleString()}
              valueColor="var(--gold-10)"
              size="sm"
            />
          </Flex>
        </Flex>
        <SvgPctChart values={[pull, push]} colors={[pullColor, pushColor]} />
      </Flex>
    </Card>
  );
}

function PushCard({ health }: GossipHealthProps) {
  const success = useEmaValue(health.num_push_entries_rx_success);
  const failTotal = useEmaValue(health.num_push_entries_rx_failure);
  const dupe = useEmaValue(health.num_push_entries_rx_duplicate);
  const fail = Math.max(failTotal - dupe, 0);

  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex gap="6">
        <Flex direction="column">
          <StatCardContent
            label="Push Entries /s"
            value={Math.trunc(success).toLocaleString()}
            valueColor={pushColor}
          />
          <Flex gap="3">
            <StatCardContent
              label="Duplicates /s"
              value={Math.trunc(dupe).toLocaleString()}
              valueColor={dupeColor}
              size="sm"
            />
            <StatCardContent
              label="Failures /s"
              value={Math.trunc(fail).toLocaleString()}
              valueColor={failColor}
              size="sm"
            />
          </Flex>
        </Flex>
        <SvgPctChart
          values={[fail, dupe, success]}
          colors={[failColor, dupeColor, pushColor]}
        />
      </Flex>
    </Card>
  );
}

function PullCard({ health }: GossipHealthProps) {
  const success = useEmaValue(health.num_pull_response_entries_rx_success);
  const failTotal = useEmaValue(health.num_pull_response_entries_rx_failure);
  const dupe = useEmaValue(health.num_pull_response_entries_rx_duplicate);
  const fail = Math.max(failTotal - dupe, 0);

  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex gap="6">
        <Flex direction="column">
          <StatCardContent
            label="Pull Entries /s"
            value={Math.trunc(success).toLocaleString()}
            valueColor={pullColor}
          />
          <Flex gap="3">
            <StatCardContent
              label="Duplicates /s"
              value={Math.trunc(dupe).toLocaleString()}
              valueColor={dupeColor}
              size="sm"
            />
            <StatCardContent
              label="Failures /s"
              value={Math.trunc(fail).toLocaleString()}
              valueColor={failColor}
              size="sm"
            />
          </Flex>
        </Flex>
        <SvgPctChart
          values={[fail, dupe, success]}
          colors={[failColor, dupeColor, pullColor]}
        />
      </Flex>
    </Card>
  );
}

interface SvgPctChartProps {
  values: number[];
  colors: string[];
}

const updateInterval = 150;
const timeFrame = 30_000;
const bufferMax = Math.trunc(timeFrame / updateInterval);

const getPath = (
  points: { x: number; y: number }[],
  height: number,
  width: number,
) => {
  if (!points.length) return "";
  points[points.length - 1].x = width;

  const path = points.map(({ x, y }) => `L ${x} ${height - y}`).join(" ");

  return (
    "M" +
    path.slice(1) +
    `L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height}, L ${points[0].x} ${points[0].y}`
  );
};

function SvgPctChart({ values, colors }: SvgPctChartProps) {
  const sizeRefs = useRef<{ height: number; width: number }>();

  const [chartData, setChartData] = useState<number[][]>([]);

  useHarmonicIntervalFn(() => {
    setChartData((prev) => {
      let chartData = [...prev];
      if (prev.length > bufferMax) {
        chartData = chartData.slice(chartData.length - bufferMax);
      }
      chartData.push(values);
      return chartData;
    });
  }, updateInterval);

  const scaledPaths = useMemo(() => {
    if (!sizeRefs.current) return;
    if (!chartData.length) return;

    const { height, width } = sizeRefs.current;
    const maxLength = chartData.length;
    const xRatio = width / maxLength;
    const yRatio = height;

    const seriesCount = chartData[0].length;
    const series = new Array(seriesCount)
      .fill(0)
      .map(() => new Array<number>(chartData.length).fill(1));

    for (let i = 0; i < chartData.length; i++) {
      const total = sum(chartData[i]);
      for (let j = 1; j < chartData[i].length; j++) {
        const pct = total ? chartData[i][j - 1] / total : 0;
        const clampPct = pct !== 0 && pct !== 1 ? clamp(pct, 0.02, 0.98) : pct;
        series[j][i] = series[j - 1][i] - clampPct;
      }
    }

    return series.map((pcts, i) => {
      const points = pcts.map((pct, i) => {
        return {
          x: i * xRatio,
          y: pct * yRatio,
        };
      });
      const path = getPath(points, height, width);
      return {
        path,
        color: colors[i],
      };
    });
  }, [chartData, colors]);

  return (
    <Box flexGrow="1">
      <AutoSizer>
        {({ height, width }) => {
          sizeRefs.current = { height, width };
          if (!scaledPaths) return null;
          return (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={width}
                height={height}
              >
                {scaledPaths.map(({ path, color }) => (
                  <path
                    key={color}
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d={path}
                    fill={color}
                  />
                ))}
              </svg>
            </>
          );
        }}
      </AutoSizer>
    </Box>
  );
}
