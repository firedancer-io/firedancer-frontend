import { useMemo, useRef } from "react";
import {
  gridColumns,
  gridGap,
  gridMinWidth,
  headerGap,
  pieChartMinDiameter,
  statsCardPieChartGap,
  storageTypes,
} from "./consts";
import type { GossipStorageStats } from "../../api/types";
import { Box, Flex, Grid, Text } from "@radix-ui/themes";
import { useValuePerSecond } from "../StartupProgress/Firedancer/useValuePerSecond";
import { Pie, type ComputedDatum, type PieTooltipProps } from "@nivo/pie";
import AutoSizer from "react-virtualized-auto-sizer";
import { sum } from "lodash";
import { StatCard } from "./StatCard";
import { useHarmonicIntervalFn } from "react-use";
import styles from "./pieChart.module.css";

interface StorageStatsChartsProps {
  storage: GossipStorageStats;
}

export default function StorageStatsCharts({
  storage,
}: StorageStatsChartsProps) {
  const data = useMemo(() => {
    if (!storage?.count) return;

    return storage.count.map((_, i) => {
      return {
        type: storageTypes[i],
        activeEntries: storage.count?.[i],
        egressCount: storage.count_tx?.[i],
        egressBytes: storage.bytes_tx?.[i],
      };
    });
  }, [storage]);

  const usedCapacity = useMemo(() => {
    const usedStorage = sum(storage.count);
    const unusedStorage = storage.capacity - usedStorage;
    return `${Math.round((usedStorage / unusedStorage) * 100)}%`;
  }, [storage.capacity, storage.count]);

  const expired = useValuePerSecond(storage.expired_count, 10_000);

  const expiredBuffer = useRef<{ ts: number; value: number }[]>([]);
  useMemo(() => {
    expiredBuffer.current.push({
      ts: performance.now(),
      value: storage.expired_count,
    });
  }, [storage.expired_count]);
  useHarmonicIntervalFn(() => {
    const now = performance.now();
    while (
      expiredBuffer.current.length > 1 &&
      now - expiredBuffer.current[0].ts > 60_000
    ) {
      expiredBuffer.current.shift();
    }
  }, 1_000);

  const expiredLastMin =
    storage.expired_count - (expiredBuffer.current[0]?.value ?? 0);

  if (!data) return;
  return (
    <Flex direction="column" gap={headerGap}>
      <Text className={styles.headerText}>Storage Stats</Text>
      <Flex gap={statsCardPieChartGap} wrap="wrap">
        <Grid
          columns={gridColumns}
          minWidth={gridMinWidth}
          gap={gridGap}
          flexGrow="1"
          flexBasis="0"
        >
          <StatCard
            label="Expired (/s)"
            value={`${Math.trunc(expired.valuePerSecond ?? 0)}`}
          />
          <StatCard
            label="Expired (Last Min)"
            value={`${expiredLastMin.toLocaleString()}`}
          />
          <StatCard label="Total Evicted" value={storage.evicted_count} />
          <StatCard label="Capacity Used" value={usedCapacity} />
        </Grid>
        <Box
          minWidth={pieChartMinDiameter}
          minHeight={pieChartMinDiameter}
          flexGrow="1"
          flexBasis="0"
        >
          <StorageStatsPieChart storage={storage} usedCapacity={usedCapacity} />
        </Box>
      </Flex>
    </Flex>
  );
}

const colors = ["#48295C", "#562800", "#132D21"];
const getColor = (i: number) => colors[i % colors.length];

function StorageStatsPieChart({
  storage,
  usedCapacity,
}: StorageStatsChartsProps & { usedCapacity: string }) {
  const data = useMemo(() => {
    const usedStorage = sum(storage.count);
    const unusedStorage = storage.capacity - usedStorage;

    return [
      {
        id: "unused",
        label: "Unused",
        value: unusedStorage,
        color: "#222",
      },
      ...storage.count
        .map((value, i) => ({
          id: storageTypes[i] + i,
          label: storageTypes[i],
          value,
        }))
        .sort((a, b) => b.value - a.value)
        .map((node, i) => {
          return { ...node, color: getColor(i) };
        }),
    ];
  }, [storage]);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <Pie
          height={height}
          width={width}
          data={data}
          colors={(d) => d.data.color}
          arcLabelsSkipAngle={10}
          arcLinkLabelsSkipAngle={10}
          arcLabelsTextColor="#9F9F9F"
          enableArcLinkLabels={false}
          layers={["arcs", "arcLabels", CenteredMetric(usedCapacity)]}
          tooltip={Tooltip}
          animate={false}
          innerRadius={0.7}
          arcLabel={(d) => d.data.label}
        />
      )}
    </AutoSizer>
  );
}

function CenteredMetric(metricLabel: string) {
  return function CenteredMetricLayer({
    dataWithArc,
    centerX,
    centerY,
  }: {
    dataWithArc: readonly ComputedDatum<{
      id: string;
      label: string;
      value: number;
    }>[];
    centerX: number;
    centerY: number;
    innerRadius: number;
    radius: number;
  }) {
    return (
      <text
        y={centerY - 6}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontSize: "28px",
          fill: "#9F9F9F",
        }}
      >
        <tspan x={centerX} dy={5}>
          {metricLabel}
        </tspan>
      </text>
    );
  };
}

function Tooltip(
  props: PieTooltipProps<{
    id: string;
    label: string;
    value: number;
    color: string;
  }>,
) {
  const value = props.datum.value;

  return (
    <div className={styles.tooltip}>
      <Text style={{ whiteSpace: "nowrap" }}>
        {props.datum.label}:&nbsp;{value}
      </Text>
    </div>
  );
}
