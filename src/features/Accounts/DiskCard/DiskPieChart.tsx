import { Box } from "@radix-ui/themes";
import {
  accountsUsedColor,
  accountsFragmentedColor,
  accountsUnusedColor,
} from "../../../colors";
import { formatSIBytes, getSafePct } from "../../../utils";
import PieChart, {
  PieCenteredMetric,
  type PieCenteredMetricProps,
} from "../../../components/PieChart";
import type { ComputedDatum } from "@nivo/pie";

type DiskPieData = {
  id: string;
  label: string;
  value: number;
  color: string;
  pct: number;
};

export default function DiskPieChart({
  usedBytes,
  fragBytes,
  unusedBytes,
}: {
  usedBytes: number;
  fragBytes: number;
  unusedBytes: number;
}) {
  const total = usedBytes + fragBytes + unusedBytes;

  const data: DiskPieData[] = [
    {
      id: "used",
      label: "Used",
      value: usedBytes,
      color: accountsUsedColor,
      pct: getSafePct(usedBytes, total),
    },
    {
      id: "fragmentation",
      label: "Fragmentation",
      value: fragBytes,
      color: accountsFragmentedColor,
      pct: getSafePct(fragBytes, total),
    },
    {
      id: "unused",
      label: "Unused",
      value: unusedBytes,
      color: accountsUnusedColor,
      pct: getSafePct(unusedBytes, total),
    },
  ];

  return (
    <Box
      flexGrow="1"
      minWidth="110px"
      minHeight="110px"
      style={{ alignSelf: "stretch" }}
    >
      <PieChart
        data={data}
        centeredMetric={CenteredMetric}
        innerRadius={0.7}
        tooltipFormatter={tooltipFormatter}
      />
    </Box>
  );
}

function CenteredMetric({
  dataWithArc,
  centerX,
  centerY,
}: PieCenteredMetricProps<DiskPieData>) {
  const used = dataWithArc.find(({ id }) => id === "used");
  const frag = dataWithArc.find(({ id }) => id === "fragmentation");
  return (
    <PieCenteredMetric centerY={centerY}>
      {used && (
        <tspan
          x={centerX}
          dy="-0.3em"
          style={{ fill: used.data.color, fontSize: "18px" }}
        >
          {used.data.pct.toFixed(2)}%
        </tspan>
      )}
      {frag && (
        <tspan
          x={centerX}
          dy="1.4em"
          style={{ fill: frag.data.color, fontSize: "14px" }}
        >
          {frag.data.pct.toFixed(2)}%
        </tspan>
      )}
    </PieCenteredMetric>
  );
}

const tooltipFormatter = (datum: ComputedDatum<DiskPieData>) => {
  const fmt = formatSIBytes(datum.data.value);
  return `${fmt.value} ${fmt.unit} (${datum.data.pct.toFixed(1)}%)`;
};
