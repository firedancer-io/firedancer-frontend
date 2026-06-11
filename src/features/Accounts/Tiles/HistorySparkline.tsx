import { useMemo } from "react";
import { useMeasure } from "react-use";

const defaultStrokeWidth = 2;

export interface HistorySparklineSeries {
  history: number[];
  color: string;
}

interface HistorySparklineProps {
  series: HistorySparklineSeries[];
  capacity?: number;
  height?: number;
  background?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export default function HistorySparkline({
  series,
  capacity,
  height = 48,
  background = "transparent",
  strokeWidth = defaultStrokeWidth,
  strokeOpacity = 0.8,
}: HistorySparklineProps) {
  const [svgRef, { width }] = useMeasure<SVGSVGElement>();

  const pointsPerSeries = useMemo(() => {
    if (!width || !height || !series.length) return [];

    const maxLength =
      capacity ?? Math.max(...series.map((s) => s.history.length));
    if (maxLength <= 0) return [];

    const globalMax = Math.max(...series.flatMap((s) => s.history), 1);
    const xRatio = maxLength > 1 ? width / (maxLength - 1) : 0;

    return series.map(({ history }) => {
      const xOffset = maxLength - history.length;
      return history
        .map((value, i) => {
          const x = (xOffset + i) * xRatio;
          const y =
            (1 - value / globalMax) * (height - strokeWidth) + strokeWidth / 2;
          return `${x},${y}`;
        })
        .join(" ");
    });
  }, [series, capacity, width, height, strokeWidth]);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height={`${height}px`}
      fill="none"
      style={{ background }}
    >
      {pointsPerSeries.map((points, i) => (
        <polyline
          key={i}
          points={points}
          stroke={series[i].color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeOpacity={strokeOpacity}
          fill="none"
        />
      ))}
    </svg>
  );
}
