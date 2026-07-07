import { Box } from "@radix-ui/themes";
import { accountsIndexUsedColor, accountsUnusedColor } from "../../../colors";
import { formatIndexCount, getSafePct } from "../../../utils";
import PieChart, {
  PieCenteredMetric,
  type PieCenteredMetricProps,
} from "../../../components/PieChart";
import type { ComputedDatum } from "@nivo/pie";
import { useMemo } from "react";

type IndexPieData = {
  id: string;
  label: string;
  value: number;
  color: string;
  pct: number;
};

export default function IndexPieChart({
  used,
  unused,
}: {
  used: number;
  unused: number;
}) {
  const data: IndexPieData[] = useMemo(() => {
    const total = used + unused;
    return [
      {
        id: "used",
        label: "Used",
        value: used,
        color: "#82593F",
        pct: getSafePct(used, total),
      },
      {
        id: "unused",
        label: "Unused",
        value: unused,
        color: accountsUnusedColor,
        pct: getSafePct(unused, total),
      },
    ];
  }, [used, unused]);

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
}: PieCenteredMetricProps<IndexPieData>) {
  const used = dataWithArc.find(({ id }) => id === "used");
  return (
    <PieCenteredMetric centerY={centerY}>
      {used && (
        <tspan
          x={centerX}
          style={{ fill: accountsIndexUsedColor, fontSize: "18px" }}
        >
          {used.data.pct.toFixed(2)}%
        </tspan>
      )}
    </PieCenteredMetric>
  );
}

const tooltipFormatter = (datum: ComputedDatum<IndexPieData>) => {
  const fmt = formatIndexCount(datum.data.value);
  return `${fmt.value} ${fmt.unit} (${datum.data.pct.toFixed(1)}%)`;
};
