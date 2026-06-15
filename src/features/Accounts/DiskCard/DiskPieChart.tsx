import { useMemo } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { formatSIBytes } from "../../../utils";
import PieChart, {
  PieCenteredMetric,
  type PieCenteredMetricProps,
} from "../../../components/PieChart";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";

type DiskPieData = {
  id: string;
  label: string;
  value: number;
  color: string;
  pct: number;
};

const USED_COLOR = "var(--blue-8)";
const FRAG_COLOR = "#FF3C3C";
const UNUSED_COLOR = "var(--gray-6)";

export default function DiskPieChart() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;
  return <DiskPieChartInner {...accountStats.disk} />;
}

function DiskPieChartInner({
  allocated_bytes,
  used_bytes,
  current_bytes,
}: {
  allocated_bytes: number;
  used_bytes: number;
  current_bytes: number;
}) {
  const fragBytes = current_bytes > used_bytes ? current_bytes - used_bytes : 0;
  const unusedBytes = Math.max(0, allocated_bytes - current_bytes);

  const usedPct = allocated_bytes ? (used_bytes / allocated_bytes) * 100 : 0;
  const fragPct = current_bytes ? (fragBytes / current_bytes) * 100 : 0;
  const unusedPct = allocated_bytes ? (unusedBytes / allocated_bytes) * 100 : 0;

  const usedFmt = formatSIBytes(used_bytes);
  const fragFmt = formatSIBytes(fragBytes);
  const unusedFmt = formatSIBytes(unusedBytes);
  const allocFmt = formatSIBytes(allocated_bytes);
  const allocFmtStr = `${allocFmt.value} ${allocFmt.unit}`;

  const data: DiskPieData[] = [
    {
      id: "used",
      label: "Used",
      value: used_bytes,
      color: USED_COLOR,
      pct: usedPct,
    },
    {
      id: "fragmentation",
      label: "Fragmentation",
      value: fragBytes,
      color: FRAG_COLOR,
      pct: fragPct,
    },
    {
      id: "unused",
      label: "Unused",
      value: unusedBytes,
      color: UNUSED_COLOR,
      pct: unusedPct,
    },
  ];

  const centeredMetric = useMemo(
    () => makeCenteredMetric(allocFmtStr),
    [allocFmtStr],
  );

  return (
    <Flex gap="3" align="center" flexGrow="1" minHeight="120px">
      <Flex direction="column" gap="2" flexShrink="0">
        <LegendRow
          color={USED_COLOR}
          label="Used"
          value={`${usedFmt.value} ${usedFmt.unit}`}
          pct={usedPct}
        />
        <LegendRow
          color={FRAG_COLOR}
          label="Fragmentation"
          value={`${fragFmt.value} ${fragFmt.unit}`}
          pct={fragPct}
        />
        <LegendRow
          color={UNUSED_COLOR}
          label="Unused"
          value={`${unusedFmt.value} ${unusedFmt.unit}`}
          pct={unusedPct}
        />
      </Flex>
      <Box
        flexGrow="1"
        flexBasis="0"
        minWidth="0"
        style={{ alignSelf: "stretch" }}
      >
        <PieChart
          data={data}
          centeredMetric={centeredMetric}
          innerRadius={0.65}
        />
      </Box>
    </Flex>
  );
}

function makeCenteredMetric(allocFmt: string) {
  return function CenteredMetricLayer({
    centerX,
    centerY,
  }: PieCenteredMetricProps<DiskPieData>) {
    return (
      <PieCenteredMetric
        centerY={centerY}
        style={{ fontSize: "12px", fill: "#9F9F9F" }}
      >
        <tspan x={centerX} y={centerY - 7}>
          Allocated
        </tspan>
        <tspan x={centerX} y={centerY + 7}>
          {allocFmt}
        </tspan>
      </PieCenteredMetric>
    );
  };
}

function LegendRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <Flex align="center" gap="2">
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          flexShrink: 0,
        }}
      />
      <Flex direction="column">
        <Text size="1" style={{ color: "var(--gray-9)" }}>
          {label}
        </Text>
        <Flex align="baseline" gap="1">
          <Text size="1" style={{ color: "var(--gray-11)", fontWeight: 500 }}>
            {value}
          </Text>
          <Text size="1" style={{ color: "var(--gray-9)" }}>
            {pct.toFixed(1)}%
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}
