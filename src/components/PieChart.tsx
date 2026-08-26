import { useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import styles from "./pieChart.module.css";

export type PieData = {
  id: string;
  value: number;
  color: string;
};

// compatible subset of @nivo/pie's ComputedDatum
export type ComputedDatum<D> = {
  id: string;
  label: string;
  value: number;
  color: string;
  data: D;
  arc: {
    startAngle: number;
    endAngle: number;
  };
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
  arcLabelsTextColor?: string;
  arcLabel?: (datum: ComputedDatum<D>) => string;
}

// Static SVG pie with the same geometry as the @nivo/pie chart it
// replaces: d3-shape pie/arc in insertion order, no pad/corner radius,
// arc labels at nivo's default 0.5 radius offset, a custom
// centered-metric layer, and a cursor-anchored tooltip.
export default function PieChart<D extends PieData>(props: PieChartProps<D>) {
  return (
    <AutoSizer>
      {({ height, width }) => (
        <PieChartContent height={height} width={width} {...props} />
      )}
    </AutoSizer>
  );
}

export function PieChartContent<D extends PieData>({
  height,
  width,
  data,
  tooltipFormatter,
  centeredMetric: CenteredMetric,
  innerRadius = 0.7,
  enableArcLabels = false,
  arcLabelsSkipAngle = 0,
  arcLabelsTextColor = "#333333",
  arcLabel,
}: PieChartProps<D> & { height: number; width: number }) {
  const [hover, setHover] = useState<{
    datum: ComputedDatum<D>;
    x: number;
    y: number;
  }>();

  const size = Math.min(height, width);
  const radius = size / 2;
  const ir = radius * innerRadius;
  const centerX = width / 2;
  const centerY = radius;

  const arcs = d3Pie<D>()
    .value((d) => d.value)
    .sortValues(null)(data);
  const arcPath = d3Arc<(typeof arcs)[number]>()
    .innerRadius(ir)
    .outerRadius(radius);

  const computed: ComputedDatum<D>[] = arcs.map((a) => ({
    id: a.data.id,
    label:
      "label" in a.data && typeof a.data.label === "string"
        ? a.data.label
        : a.data.id,
    value: a.value,
    color: a.data.color,
    data: a.data,
    arc: { startAngle: a.startAngle, endAngle: a.endAngle },
  }));

  const labelRadius = ir + (radius - ir) * 0.5;

  return (
    <div
      style={{ position: "relative", width, height }}
      onMouseLeave={() => setHover(undefined)}
    >
      <svg width={width} height={height} role="img">
        <g transform={`translate(${centerX},${centerY})`}>
          {computed.map((datum, i) => (
            <path
              key={datum.id}
              d={arcPath(arcs[i]) ?? undefined}
              fill={datum.color}
              onMouseMove={
                tooltipFormatter
                  ? (e) => {
                      const box =
                        e.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
                      setHover({
                        datum,
                        x: e.clientX - (box?.left ?? 0),
                        y: e.clientY - (box?.top ?? 0),
                      });
                    }
                  : undefined
              }
            />
          ))}
          {enableArcLabels &&
            computed.map((datum, i) => {
              const { startAngle, endAngle } = arcs[i];
              const angleDeg = ((endAngle - startAngle) * 180) / Math.PI;
              if (angleDeg < arcLabelsSkipAngle) return null;
              const mid = (startAngle + endAngle) / 2 - Math.PI / 2;
              const x = Math.cos(mid) * labelRadius;
              const y = Math.sin(mid) * labelRadius;
              return (
                <text
                  key={datum.id}
                  transform={`translate(${x},${y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontFamily: "sans-serif",
                    fontSize: 11,
                    fill: arcLabelsTextColor,
                    pointerEvents: "none",
                  }}
                >
                  {arcLabel ? arcLabel(datum) : datum.value}
                </text>
              );
            })}
        </g>
        {CenteredMetric && (
          <CenteredMetric
            dataWithArc={computed}
            centerX={centerX}
            centerY={centerY}
            innerRadius={ir}
            radius={radius}
          />
        )}
      </svg>
      {hover && tooltipFormatter && (
        <div
          style={{
            position: "absolute",
            left: hover.x,
            top: hover.y,
            transform: "translate(-50%, -100%) translateY(-14px)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <PieTooltip>
            <span>
              {hover.datum.label}:&nbsp;{tooltipFormatter(hover.datum)}
            </span>
          </PieTooltip>
        </div>
      )}
    </div>
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
      y={centerY}
      textAnchor="middle"
      dominantBaseline="central"
      style={style}
    >
      {children}
    </text>
  );
}
