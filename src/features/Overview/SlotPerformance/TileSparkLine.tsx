import { useMeasure } from "react-use";
import { useLayoutEffect, useMemo, useRef } from "react";
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
import clsx from "clsx";

// 4 slots worth
const leaderGroupWindowMs = 400 * 4;
const _updateIntervalMs = 80;

interface TileParkLineProps {
  value?: number;
  value2?: number;
  history?: number[] | { ts: number; value: number }[];
  history2?: number[] | { ts: number; value: number }[];
  height?: number;
  background?: string;
  windowMs?: number;
  strokeWidth?: number;
  updateIntervalMs?: number;
  tickMs?: number;
  stroke?: string;
  stroke2?: string;
  fill?: boolean;
}

export default function TileSparkLine({
  value,
  value2,
  history,
  history2,
  height = 24,
  background,
  windowMs = leaderGroupWindowMs,
  strokeWidth = strokeLineWidth,
  updateIntervalMs = _updateIntervalMs,
  tickMs,
  stroke,
  stroke2,
  fill = true,
}: TileParkLineProps) {
  const [svgRef, { width }] = useMeasure<SVGSVGElement>();

  const {
    scaledDataPoints,
    scaledDataPoints2,
    range,
    pxPerTick,
    chartTickMs,
    isLive,
  } = useScaledDataPoints({
    value,
    value2,
    history,
    history2,
    windowMs,
    height,
    width,
    updateIntervalMs,
    tickMs,
  });

  return (
    <Sparkline
      svgRef={svgRef}
      scaledDataPoints={scaledDataPoints}
      scaledDataPoints2={scaledDataPoints2}
      range={range}
      height={height}
      background={background}
      pxPerTick={pxPerTick}
      tickMs={chartTickMs}
      isLive={isLive}
      strokeWidth={strokeWidth}
      stroke={stroke}
      stroke2={stroke2}
      fill={fill}
    />
  );
}

interface SparklineProps {
  svgRef?: UseMeasureRef<SVGSVGElement>;
  scaledDataPoints: {
    x: number;
    y: number;
  }[];
  scaledDataPoints2?: {
    x: number;
    y: number;
  }[];
  range?: SparklineRange;
  showRange?: boolean;
  height: number;
  background?: string;
  pxPerTick: number;
  tickMs: number;
  isLive: boolean;
  strokeWidth?: number;
  stroke?: string;
  stroke2?: string;
  fill?: boolean;
}
export function Sparkline({
  svgRef,
  scaledDataPoints,
  scaledDataPoints2,
  range = sparkLineRange,
  showRange = false,
  height,
  background = tileSparklineBackgroundColor,
  pxPerTick,
  tickMs,
  isLive,
  strokeWidth = strokeLineWidth,
  stroke,
  stroke2,
  fill = true,
}: SparklineProps) {
  const gRef = useRef<SVGGElement | null>(null);
  const polyRef = useRef<SVGPolylineElement | null>(null);
  const polyRef2 = useRef<SVGPolylineElement | null>(null);
  const animateRef = useRef<Animation | null>(null);

  // where the gradient colors start / end, given y scale and offset
  const gradientRange: SparklineRange = useMemo(() => {
    const scale = range[1] - range[0];
    const gradientHeight = (height - strokeWidth * 2) / scale;
    const top = gradientHeight * (range[1] - 1);
    const bottom = top + gradientHeight;
    return [bottom, top];
  }, [height, range, strokeWidth]);

  const points = useMemo(
    () => scaledDataPoints.map(({ x, y }) => `${x},${y}`).join(" "),
    [scaledDataPoints],
  );

  const points2 = useMemo(
    () =>
      scaledDataPoints2
        ? scaledDataPoints2.map(({ x, y }) => `${x},${y}`).join(" ")
        : "",
    [scaledDataPoints2],
  );

  useLayoutEffect(() => {
    const el = gRef.current;
    if (!el) return;

    if (isLive) {
      // Only initialize animate object the first time
      if (!animateRef.current) {
        animateRef.current = el.animate(
          [
            { transform: "translate3d(0px, 0, 0)" },
            { transform: "translate3d(0px, 0, 0)" },
          ],
          { duration: tickMs, easing: "linear", fill: "forwards" },
        );
        animateRef.current.cancel();
      }

      animateRef.current.finish();

      polyRef.current?.setAttribute("points", points);
      polyRef2.current?.setAttribute("points", points2);

      const effect = animateRef.current.effect as KeyframeEffect;
      effect.setKeyframes([
        { transform: "translate3d(0px, 0, 0)" },
        { transform: `translate3d(${-pxPerTick}px, 0, 0)` },
      ]);
      effect.updateTiming({
        duration: tickMs,
        easing: "linear",
        fill: "forwards",
      });

      animateRef.current.currentTime = 0;
      animateRef.current.play();
    } else {
      polyRef.current?.setAttribute("points", points);
      polyRef2.current?.setAttribute("points", points2);
      animateRef.current?.cancel();
    }
  }, [isLive, points, points2, pxPerTick, tickMs]);

  const stroke1 = stroke ?? "url(#paint0_linear_2971_11300)";

  return (
    <>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height={`${height}px`}
        fill="none"
        style={{ background }}
        shapeRendering="optimizeSpeed"
      >
        <g ref={gRef} className={styles.gTransform}>
          <polyline
            ref={polyRef}
            stroke={stroke1}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {scaledDataPoints2 && (
            <polyline
              ref={polyRef2}
              stroke={stroke2 ?? "url(#paint0_linear_2971_11300)"}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </g>

        {fill && (
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
        )}
      </svg>

      {showRange && (
        <>
          <div className={clsx(styles.rangeLabel, styles.top)}>
            {Math.round(range[1] * 100)}%
          </div>
          <div className={clsx(styles.rangeLabel, styles.bottom)}>
            {Math.round(range[0] * 100)}%
          </div>
        </>
      )}
    </>
  );
}
