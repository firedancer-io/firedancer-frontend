import { useMeasure } from "react-use";
import { useMemo } from "react";
import {
  tileBusyGreenColor,
  tileBusyRedColor,
  tileSparklineBackgroundColor,
} from "../../../colors";
import type { UseMeasureRef } from "react-use/lib/useMeasure";
import type { SparklineRange } from "./useTileSparkline";
import {
  sparkLineRange,
  strokeLineWidth,
  useScaledDataPoints,
} from "./useTileSparkline";
import styles from "./tileSparkline.module.css";

interface TileParkLineProps {
  value?: number;
  queryBusy?: number[];
  height?: number;
  includeBg?: boolean;
}

export default function TileSparkLine({
  value,
  queryBusy,
  height = 24,
  includeBg,
}: TileParkLineProps) {
  const [svgRef, { width }] = useMeasure<SVGSVGElement>();

  const { scaledDataPoints, range } = useScaledDataPoints({
    value,
    queryBusy,
    rollingWindowMs: 1600,
    height,
    width,
    updateIntervalMs: 10,
  });

  return (
    <Sparkline
      svgRef={svgRef}
      scaledDataPoints={scaledDataPoints}
      range={range}
      height={height}
      background={includeBg ? undefined : "unset"}
    />
  );
}

interface SparklineProps {
  svgRef?: UseMeasureRef<SVGSVGElement>;
  scaledDataPoints: {
    x: number;
    y: number;
  }[];
  range?: SparklineRange;
  showRange?: boolean;
  height: number;
  background?: string;
}
export function Sparkline({
  svgRef,
  scaledDataPoints,
  range = sparkLineRange,
  showRange = false,
  height,
  background = tileSparklineBackgroundColor,
}: SparklineProps) {
  const points = scaledDataPoints.map(({ x, y }) => `${x},${y}`).join(" ");

  // where the gradient colors start / end, given y scale and offset
  const gradientRange: SparklineRange = useMemo(() => {
    const scale = range[1] - range[0];
    const gradientHeight = (height - strokeLineWidth * 2) / scale;
    const top = gradientHeight * (range[1] - 1);
    const bottom = top + gradientHeight;
    return [bottom, top];
  }, [height, range]);

  return (
    <>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height={`${height}px`}
        fill="none"
        style={{ background }}
      >
        <polyline
          points={points}
          stroke="url(#paint0_linear_2971_11300)"
          widths={2}
          strokeWidth={strokeLineWidth}
          strokeLinecap="round"
        />

        <defs>
          <linearGradient
            id="paint0_linear_2971_11300"
            x1="59.5"
            y1={gradientRange[0]}
            x2="59.5"
            y2={gradientRange[1]}
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={tileBusyGreenColor} />
            <stop offset="1" stopColor={tileBusyRedColor} />
          </linearGradient>
        </defs>
      </svg>

      {showRange && (
        <>
          <div className={styles.rangeLabel} style={{ top: 0 }}>
            {Math.round(range[1] * 100)}%
          </div>
          <div className={styles.rangeLabel} style={{ bottom: 0 }}>
            {Math.round(range[0] * 100)}%
          </div>
        </>
      )}
    </>
  );
}
