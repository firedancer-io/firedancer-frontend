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
  queryBusy?: number[];
  height?: number;
  background?: string;
  windowMs?: number;
  strokeWidth?: number;
  updateIntervalMs?: number;
  tickMs?: number;
}

export default function TileSparkLine({
  value,
  queryBusy,
  height = 24,
  background,
  windowMs = leaderGroupWindowMs,
  strokeWidth = strokeLineWidth,
  updateIntervalMs = _updateIntervalMs,
  tickMs,
}: TileParkLineProps) {
  const [svgRef, { width }] = useMeasure<SVGSVGElement>();

  const { scaledDataPoints, range, pxPerTick, chartTickMs, isLive } =
    useScaledDataPoints({
      value,
      queryBusy,
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
      range={range}
      height={height}
      background={background}
      pxPerTick={pxPerTick}
      tickMs={chartTickMs}
      isLive={isLive}
      strokeWidth={strokeWidth}
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
  pxPerTick: number;
  tickMs: number;
  isLive: boolean;
  strokeWidth?: number;
}
export function Sparkline({
  svgRef,
  scaledDataPoints,
  range = sparkLineRange,
  showRange = false,
  height,
  background = tileSparklineBackgroundColor,
  pxPerTick,
  tickMs,
  isLive,
  strokeWidth = strokeLineWidth,
}: SparklineProps) {
  const gRef = useRef<SVGGElement | null>(null);
  const polyRef = useRef<SVGPolylineElement | null>(null);
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
      animateRef.current?.cancel();
    }
  }, [isLive, points, pxPerTick, tickMs]);

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
            stroke="url(#paint0_linear_2971_11300)"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </g>

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
