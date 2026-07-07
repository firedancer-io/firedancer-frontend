import { useMemo } from "react";
import { useMeasure } from "react-use";

const HEIGHT = 12;
const STROKE_WIDTH = 2;
const STROKE_OPACITY = 0.8;
const DRAWABLE_HEIGHT = HEIGHT - STROKE_WIDTH;

function toPolylinePoints(
  history: number[],
  xOffset: number,
  xRatio: number,
  maxYValue: number,
): string {
  return history
    .map((value, i) => {
      const x = (xOffset + i) * xRatio;
      const normalized = value / maxYValue;
      const flipped = 1 - normalized;
      const y = flipped * DRAWABLE_HEIGHT + STROKE_WIDTH / 2;
      return `${x},${y}`;
    })
    .join(" ");
}

export default function HistorySparkline({
  series,
}: {
  series: {
    history: number[];
    color: string;
  }[];
}) {
  const [svgRef, { width }] = useMeasure<SVGSVGElement>();

  const pointsPerSeries = useMemo(() => {
    if (!width || !series.length) return [];

    const maxXValue = Math.max(...series.map((s) => s.history.length));
    if (!maxXValue) return [];

    const xRatio = maxXValue > 1 ? width / (maxXValue - 1) : 0;
    const maxYValue = Math.max(...series.flatMap((s) => s.history), 1);

    return series.map(({ history }) =>
      toPolylinePoints(history, maxXValue - history.length, xRatio, maxYValue),
    );
  }, [series, width]);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height={`${HEIGHT}px`}
      fill="none"
    >
      {pointsPerSeries.map((points, i) => (
        <polyline
          key={i}
          points={points}
          stroke={series[i].color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeOpacity={STROKE_OPACITY}
          fill="none"
        />
      ))}
    </svg>
  );
}
