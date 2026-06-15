import { useMemo } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import type { ComputedDatum, PieLayer } from "@nivo/pie";
import { Pie } from "@nivo/pie";
import styles from "./pieChart.module.css";

export type PieData = {
  id: string;
  value: number;
  color: string;
};

export type PieCenteredMetricProps<D> = {
  dataWithArc: readonly ComputedDatum<D>[];
  centerX: number;
  centerY: number;
  innerRadius: number;
  radius: number;
};

interface PieChartProps<D extends PieData> {
  data: D[];
  tooltipFormatter?: (datum: ComputedDatum<D>) => React.ReactNode;
  centeredMetric?: React.FC<PieCenteredMetricProps<D>>;
  innerRadius?: number;
  enableArcLabels?: boolean;
  arcLabelsSkipAngle?: number;
  enableArcLinkLabels?: boolean;
  arcLinkLabelsSkipAngle?: number;
  arcLabelsTextColor?: string;
  arcLabel?: string | ((datum: ComputedDatum<D>) => string);
}

export default function PieChart<D extends PieData>({
  data,
  tooltipFormatter,
  centeredMetric,
  innerRadius = 0.7,
  enableArcLabels = false,
  arcLabelsSkipAngle,
  enableArcLinkLabels = false,
  arcLinkLabelsSkipAngle,
  arcLabelsTextColor,
  arcLabel,
}: PieChartProps<D>) {
  const layers: PieLayer<D>[] = ["arcs"];
  if (enableArcLabels) layers.push("arcLabels");
  if (centeredMetric) layers.push(centeredMetric);

  const tooltip = useMemo(
    () =>
      tooltipFormatter
        ? ({ datum }: { datum: ComputedDatum<D> }) => (
            <PieTooltip>
              <span>
                {datum.label}:&nbsp;{tooltipFormatter(datum)}
              </span>
            </PieTooltip>
          )
        : () => null,
    [tooltipFormatter],
  );

  return (
    <AutoSizer>
      {({ height, width }) => (
        <Pie
          height={height}
          width={width}
          data={data}
          colors={(d) => d.data.color}
          enableArcLabels={enableArcLabels}
          enableArcLinkLabels={enableArcLinkLabels}
          arcLabelsSkipAngle={arcLabelsSkipAngle}
          arcLinkLabelsSkipAngle={arcLinkLabelsSkipAngle}
          arcLabelsTextColor={arcLabelsTextColor}
          arcLabel={arcLabel}
          layers={layers}
          tooltip={tooltip}
          animate={false}
          innerRadius={innerRadius}
        />
      )}
    </AutoSizer>
  );
}

export function PieTooltip({ children }: { children: React.ReactNode }) {
  return <div className={styles.tooltip}>{children}</div>;
}

export function PieCenteredMetric({
  centerY,
  children,
  style,
}: {
  centerY: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <text
      y={centerY - 6}
      textAnchor="middle"
      dominantBaseline="central"
      style={style}
    >
      {children}
    </text>
  );
}
