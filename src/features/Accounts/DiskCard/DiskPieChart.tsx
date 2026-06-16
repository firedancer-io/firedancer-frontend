import { useMemo } from "react";
import { Box } from "@radix-ui/themes";
import { formatSIBytes } from "../../../utils";
import PieChart, {
  PieCenteredMetric,
  type PieCenteredMetricProps,
} from "../../../components/PieChart";
import type { ComputedDatum } from "@nivo/pie";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";

type DiskPieData = {
  id: string;
  label: string;
  value: number;
  color: string;
  pct: number;
};

const USED_COLOR = "rgb(54, 58, 99)";
const FRAG_COLOR = "#E5484D";
const UNUSED_COLOR = "var(--gray-5)";

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

  const tooltipFormatter = (datum: ComputedDatum<DiskPieData>) => {
    const fmt = formatSIBytes(datum.data.value);
    return `${fmt.value} ${fmt.unit} (${datum.data.pct.toFixed(1)}%)`;
  };

  return (
    <Box flexGrow="1" minHeight="120px" style={{ alignSelf: "stretch" }}>
      <PieChart
        data={data}
        centeredMetric={centeredMetric}
        innerRadius={0.65}
        tooltipFormatter={tooltipFormatter}
      />
    </Box>
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
