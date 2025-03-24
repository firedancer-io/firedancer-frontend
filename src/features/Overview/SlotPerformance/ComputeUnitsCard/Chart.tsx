import AutoSizer from "react-virtualized-auto-sizer";
import { ComputeUnits } from "../../../../api/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ReferenceArea,
  Polygon,
  Rectangle,
  RectangleProps,
  LineChart,
  CartesianGrid,
} from "recharts";
import { Segment } from "recharts/types/cartesian/ReferenceLine";
import ChartTooltip from "./ChartTooltip";
import { useEventListener } from "../../../../hooks/useEventListener";
import { hasModKey } from "../../../../utils";
import { useDebouncedCallback, useThrottledCallback } from "use-debounce";
import { CategoricalChartState } from "recharts/types/chart/types";
import clsx from "clsx";
import styles from "./computeUnits.module.css";
import memoize from "micro-memoize";
import { useAtom, useSetAtom } from "jotai";
import {
  fitYToDataAtom,
  isMaxZoomRangeAtom,
  triggerZoomAtom,
  zoomRangeAtom,
} from "./atoms";
import Hammer from "hammerjs";
import { useUnmount } from "react-use";
import { Domain, ZoomRange } from "./types";
import {
  extendDomain,
  notEqual,
  prettyIntervals,
  withinDomain,
} from "./chartUtils";
import { AxisDomain, Coordinate } from "recharts/types/util/types";

interface ChartProps {
  computeUnits: ComputeUnits;
  bankTileCount: number;
}

interface ChartData {
  timestampNanos: number;
  computeUnits: number;
  activeBankCount: number;
}

const minRangeNanos = 50_000;
const wheelZoomInSpeed = 12;
const wheelZoomOutSpeed = 20;
const wheelScrollSpeed = 1 / 3_000;
const smNanosThreshold = 5_000_000;
const mdNanosThreshold = 50_000_000;
const _segmentColors = [
  { fill: "#1E9C50", opacity: 0.15 },
  { fill: "#AE5511", opacity: 0.15 },
  { fill: "#CF321D", opacity: 0.15 },
  { fill: "#F40505", opacity: 0.15 },
  { fill: "#F40505", opacity: 0.2 },
];
const getSegmentColor = (index: number) => {
  return _segmentColors[index] ?? _segmentColors[_segmentColors.length - 1];
};
const cuAxisId = "computeUnits";
const bankCountAxisId = "activeBankCount";
const defaultCuTicks = [
  8_000_000, 16_000_000, 24_000_000, 32_000_000, 40_000_000, 48_000_000,
];

const cusPerNs = 1 / 8;
const tickLabelWidth = 110;
const minTickCount = 3;

function getChartData(computeUnits: ComputeUnits): ChartData[] {
  const data: ChartData[] = [
    { timestampNanos: 0, computeUnits: 0, activeBankCount: 0 },
  ];

  for (let i = 0; i < computeUnits.compute_unit_timestamps_nanos.length; i++) {
    const prev = data[data.length - 1];

    if (
      prev &&
      computeUnits.compute_unit_timestamps_nanos[i - 1] ===
        computeUnits.compute_unit_timestamps_nanos[i]
    ) {
      prev.computeUnits += computeUnits.compute_units_deltas[i];
      prev.activeBankCount = computeUnits.active_bank_count[i];
    } else {
      data.push({
        timestampNanos: Number(
          computeUnits.compute_unit_timestamps_nanos[i] -
            computeUnits.start_timestamp_nanos,
        ),
        computeUnits: prev.computeUnits + computeUnits.compute_units_deltas[i],
        activeBankCount: computeUnits.active_bank_count[i],
      });
    }
  }

  return data;
}

const getXTicks = memoize(function getXTicks(
  tsMinNanos: number,
  tsMaxNanos: number,
  intervalCount: number,
) {
  return prettyIntervals(tsMinNanos, tsMaxNanos, intervalCount);
});

function getDataDomain(
  data: ChartData[],
  maxComputeUnits: number,
  zoomRange: ZoomRange | undefined,
): Domain | undefined {
  if (!data.length) return;

  const startTime = zoomRange?.[0] ?? 0;
  const endTime = zoomRange?.[1] ?? data[data.length - 1].timestampNanos;

  // Find start of the time range
  let ix = data.findIndex((d) => d.timestampNanos >= startTime);
  if (ix < 0) return;

  // Adjust to include an additional data point at the start of the time range
  if (ix > 0) ix -= 1;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (; ix < data.length; ix++) {
    const pt = data[ix];
    // if (pt.timestampNanos > endTime) break;

    if (pt !== undefined) {
      min = Math.min(min, pt.computeUnits);
      max = Math.max(max, pt.computeUnits);
    }

    // Doing the check after the min/max means we included an additional data point past
    // the end of the time range as well, for nicer data display when zooming
    if (pt.timestampNanos > endTime) break;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return;

  const domain = extendDomain([min, max], 100);
  return [Math.max(0, domain[0]), Math.min(maxComputeUnits, domain[1])];
}

function getCuByTs({
  ts,
  bankCount,
  tEnd,
  maxComputeUnits,
}: {
  ts: number;
  bankCount: number;
  tEnd: number;
  maxComputeUnits: number;
}) {
  return Math.round(bankCount * cusPerNs * (ts - tEnd) + maxComputeUnits);
}

function getTsByCu({
  computeUnits,
  bankCount,
  tEnd,
  maxComputeUnits,
}: {
  computeUnits: number;
  bankCount: number;
  tEnd: number;
  maxComputeUnits: number;
}) {
  return Math.round(
    (computeUnits - maxComputeUnits) / bankCount / cusPerNs + tEnd,
  );
}

function getBankCount({
  computeUnits,
  ts,
  tEnd,
  maxComputeUnits,
}: {
  computeUnits: number;
  ts: number;
  tEnd: number;
  maxComputeUnits: number;
}) {
  return Math.trunc((computeUnits - maxComputeUnits) / cusPerNs / (ts - tEnd));
}

function getSegments(
  computeUnits: ComputeUnits,
  bankTileCount: number,
  xDomain: Domain,
  yDomain: Domain,
) {
  const segments: Segment[][] = [];
  const tEnd =
    0.95 *
    Number(
      computeUnits.target_end_timestamp_nanos -
        computeUnits.start_timestamp_nanos,
    );

  const getCusAtTs = (ts: number, bankCount: number) => {
    return getCuByTs({
      ts,
      bankCount,
      tEnd,
      maxComputeUnits: computeUnits.max_compute_units,
    });
  };

  for (let bankCount = 1; bankCount <= bankTileCount; bankCount++) {
    const y0Ts = getTsByCu({
      computeUnits: yDomain[0],
      tEnd,
      maxComputeUnits: computeUnits.max_compute_units,
      bankCount,
    });
    const t0X = withinDomain(xDomain, y0Ts) ? y0Ts : xDomain[0];
    const t0Y = getCusAtTs(t0X, bankCount);

    const y1Ts = getTsByCu({
      computeUnits: Math.min(yDomain[1], computeUnits.max_compute_units),
      tEnd,
      maxComputeUnits: computeUnits.max_compute_units,
      bankCount,
    });

    const t1X = withinDomain(xDomain, y1Ts) ? y1Ts : xDomain[1];
    const t1Y = getCusAtTs(t1X, bankCount);

    segments.push([
      { x: t0X, y: t0Y },
      { x: t1X, y: t1Y },
    ]);
  }

  return segments;
}

function getPolygonPoints(
  a: [Coordinate, Coordinate],
  b: [Coordinate, Coordinate],
) {
  // Assuming lines never intersect
  if (a[0].x > b[0].x || a[1].x > b[1].x) {
    const swap = a;
    a = b;
    b = swap;
  }

  const resPoints = [...a];
  const curPoint = () => resPoints[resPoints.length - 1];

  if (notEqual(a[1].x, b[1].x, 1)) {
    resPoints.push({ x: b[1].x, y: a[1].y });
  }
  // TODO: fix adding extra unneeded points
  if (notEqual(curPoint().y, b[1].y, 1)) {
    resPoints.push({ x: curPoint().x, y: b[1].y });
  }

  resPoints.push(b[1], b[0]);

  if (notEqual(curPoint().x, a[0].x, 1)) {
    resPoints.push({ x: a[0].x, y: curPoint().y });
  }

  if (notEqual(curPoint().y, a[0].y, 1)) {
    resPoints.push({ x: curPoint().x, y: a[0].y });
  }

  return resPoints;
}

export default function Chart({ computeUnits, bankTileCount }: ChartProps) {
  const isMouseDownRef = useRef(false);
  const [isModKeyDown, setIsModKeyDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragRange, setDragRange] = useState<[number, number]>();

  const [fitYToData, setFitYToData] = useAtom(fitYToDataAtom);
  const [zoomRange, setZoomRange] = useAtom(zoomRangeAtom);
  const setIsMaxZoomRange = useSetAtom(isMaxZoomRangeAtom);
  useUnmount(() => {
    setZoomRange(undefined);
    setIsMaxZoomRange(false);
  });

  useEffect(() => {
    if (zoomRange === undefined) {
      setFitYToData(false);
      setIsMaxZoomRange(false);
    }
  }, [setFitYToData, setIsMaxZoomRange, zoomRange]);

  const hoverPosRef = useRef<number>();
  const hoverTs = useRef<number>();
  const lastPanTs = useRef<number>();

  const isDragging = dragRange !== undefined;
  const isActiveDragging = isDragging && dragRange[0] !== dragRange[1];
  const isZoomed = zoomRange !== undefined;

  const data = useMemo(() => getChartData(computeUnits), [computeUnits]);

  const slotDurationNanos = Number(
    computeUnits.target_end_timestamp_nanos -
      computeUnits.start_timestamp_nanos,
  );
  const dataStartTs = 0;
  const dataEndTs =
    slotDurationNanos > data[data.length - 1].timestampNanos
      ? slotDurationNanos
      : data[data.length - 1].timestampNanos;
  const visStartTs = zoomRange?.[0] ?? 0;
  const visEndTs = zoomRange?.[1] ?? dataEndTs;
  const xDomain = useMemo(
    () => extendDomain([visStartTs, visEndTs], 1.5),
    [visStartTs, visEndTs],
  );

  const [_chartWidth, _setChartWidth] = useState(0);
  const setChartWidth = useDebouncedCallback((value: number) => {
    _setChartWidth(value);
  }, 500);

  // For chart margin and y axis ticks
  const chartWidth = Math.max(0, _chartWidth - 100);
  const xLabelCount = Math.max(
    minTickCount,
    Math.trunc(chartWidth / tickLabelWidth),
  );
  const xTicks = useMemo(
    () => getXTicks(xDomain[0], xDomain[1], xLabelCount),
    [xDomain, xLabelCount],
  );

  const cuDomain = useMemo(
    () =>
      fitYToData
        ? getDataDomain(data, computeUnits.max_compute_units, zoomRange)
        : undefined,
    [computeUnits.max_compute_units, data, fitYToData, zoomRange],
  );

  const yDomain = useMemo<Domain>(
    () => cuDomain ?? [0, computeUnits.max_compute_units + 1_000_000],
    [computeUnits.max_compute_units, cuDomain],
  );

  const segments = useMemo(
    () => getSegments(computeUnits, bankTileCount, xDomain, yDomain),
    [bankTileCount, computeUnits, xDomain, yDomain],
  );

  const activeBankCountTicks = new Array(bankTileCount)
    .fill(0)
    .map((_, i) => i + 1);

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setDragRange(undefined);
    setIsModKeyDown(hasModKey(e));
  };

  useEventListener("keydown", handleKey);
  useEventListener("keyup", handleKey);
  // To cancel zoom if mouse is released outside chart
  useEventListener("mouseup", (e: MouseEvent) => {
    setDragRange(undefined);
  });

  const containerElRef = useRef<HTMLDivElement>(null);
  useEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (hasModKey(e)) {
        e.preventDefault();
      }
    },
    containerElRef.current ?? undefined,
  );

  const updateZoom = (
    newStartTs: number,
    newEndTs: number,
    isPanning = false,
  ) => {
    // No data => no zoom
    if (dataStartTs === dataEndTs) {
      setZoomRange(undefined);
      return;
    }

    newStartTs = Math.max(Math.trunc(newStartTs), dataStartTs);
    newEndTs = Math.min(Math.trunc(newEndTs), dataEndTs);

    if (newEndTs - newStartTs < minRangeNanos) {
      setIsMaxZoomRange(true);

      // Ensure the zoom range does not go below a minimum
      newStartTs = Math.max(
        Math.trunc((newStartTs + newEndTs - minRangeNanos) / 2),
        dataStartTs,
      );
      newEndTs = newStartTs + minRangeNanos;

      if (newEndTs > dataEndTs) {
        newEndTs = dataEndTs;
        newStartTs = newEndTs - minRangeNanos;
      }
    }

    if (newStartTs > dataEndTs - minRangeNanos) {
      // Ensure the zoom range does not go beyond the data
      const curRange = newEndTs - newStartTs;
      newStartTs = dataEndTs - minRangeNanos;
      newEndTs = newStartTs + curRange;
    }

    // Prevent scooting the range when zooming
    if (!isPanning && newEndTs - newStartTs === visEndTs - visStartTs) {
      return;
    }

    if (newStartTs !== visStartTs || newEndTs !== visEndTs) {
      if (newStartTs === dataStartTs && newEndTs === dataEndTs) {
        // Disable zoom when zooming out to full range
        setZoomRange(undefined);
      } else {
        setZoomRange([newStartTs, newEndTs]);
        if (!isPanning) {
          setIsMaxZoomRange(false);
        }
      }
    }
  };

  const updateDrag = useThrottledCallback(
    (dragEnd: number) =>
      setDragRange(([dragStart] = [dragEnd, dragEnd]) => [dragStart, dragEnd]),
    50,
  );

  const updatePan = (panAmount: number) => {
    const range = visEndTs - visStartTs;
    const newStartTs = visStartTs + panAmount;
    const newEndTs = visEndTs + panAmount;

    if (newStartTs < dataStartTs) {
      updateZoom(dataStartTs, dataStartTs + range, true);
    } else if (newEndTs > dataEndTs) {
      updateZoom(dataEndTs - range, dataEndTs, true);
    } else {
      updateZoom(newStartTs, newEndTs, true);
    }
  };

  const updatePanByDrag = useThrottledCallback((panPosition: number) => {
    if (isZoomed && chartWidth && lastPanTs.current !== undefined) {
      const range = visEndTs - visStartTs;
      const relativePanAmt = (lastPanTs.current - panPosition) / chartWidth;
      updatePan(relativePanAmt * range);
      lastPanTs.current = panPosition;
    }
  }, 50);

  const onMouseDown = (
    chartState?: CategoricalChartState,
    e?: React.MouseEvent,
  ) => {
    if (chartState?.activeLabel && (e?.button === 0 || e?.button === 1)) {
      isMouseDownRef.current = true;

      if (e.button === 1) {
        e.preventDefault();
      }

      const currentTs = +chartState.activeLabel;
      if (hasModKey(e) || e.button === 1) {
        setIsPanning(true);
        lastPanTs.current = chartState.chartX;
      } else {
        setDragRange([currentTs, currentTs]);
      }
    }
  };

  const onMouseUp = (chartState?: CategoricalChartState) => {
    if (!isMouseDownRef.current) return;

    isMouseDownRef.current = false;
    setIsPanning(false);
    setDragRange(undefined);

    if (isPanning) return;
    if (isActiveDragging) {
      // Handle drag-to-zoom
      const [dragStart, dragEnd] = dragRange;
      updateZoom(Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd));
    }
  };

  const onContainerMouseMove = ({ clientX }: React.MouseEvent) => {
    hoverPosRef.current = clientX;
  };

  const onContainerMouseOut = ({ clientX }: React.MouseEvent) => {
    hoverPosRef.current = undefined;
  };

  const onMouseMove = (chartState?: CategoricalChartState) => {
    hoverTs.current = undefined;

    if (chartState?.activeLabel) {
      const currentTs = +chartState.activeLabel;
      hoverTs.current = currentTs;

      if (isDragging) {
        updateDrag(currentTs);
      } else if (isZoomed && isPanning && chartState.chartX !== undefined) {
        // Handle drag-to-pan
        updatePanByDrag(chartState.chartX);
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!hasModKey(e)) return;

    const { deltaX, deltaY, shiftKey, currentTarget, target, detail } = e;

    // Using detail to differentiate dispatched events
    if (detail !== -1) {
      try {
        let tgt = target as HTMLElement | null;
        while (tgt && !tgt.classList.contains("recharts-surface"))
          tgt = tgt.parentElement;
        if (
          !tgt ||
          tgt.parentElement?.classList.contains("recharts-legend-item")
        )
          return;
      } catch {
        // ignore
      }
    }

    if (!isMouseDownRef.current && (deltaY || deltaX)) {
      const range = visEndTs - visStartTs;

      if (shiftKey || deltaX) {
        updatePan(range * (deltaX || deltaY) * wheelScrollSpeed);
      }

      if (!shiftKey && deltaY) {
        const adjustFactor =
          deltaY < 0
            ? (wheelZoomInSpeed * deltaY) / 1e4
            : (wheelZoomOutSpeed * deltaY) / 1e4;
        const zoomAmt = range * -adjustFactor;

        let hoverRelPos = 0.5;
        if (hoverTs.current !== undefined) {
          // Use hovered data point time label as zoom focus
          hoverRelPos = (hoverTs.current - visStartTs) / range;
        } else if (hoverPosRef.current !== undefined) {
          // Use chart container hover position as a rough zoom focus
          if (hoverPosRef.current > currentTarget.clientWidth / 2) {
            hoverRelPos = (dataEndTs - visStartTs) / range;
          } else {
            hoverRelPos = 0;
          }
        }

        // Adjust zoom focus for more pleasant behavior
        if (deltaY > 0) {
          // Zooming out, ensure a minimum of visual range is extended at the chart edges
          hoverRelPos = Math.max(0.1, Math.min(0.9, hoverRelPos));
        } else {
          // Zooming in, bias zoom target towards the center of the chart
          hoverRelPos = (hoverRelPos - 0.5) * 1.1 + 0.5;
        }

        updateZoom(
          visStartTs + zoomAmt * hoverRelPos,
          visEndTs - zoomAmt * (1 - hoverRelPos),
        );
      }
    }
  };

  const setTriggerZoom = useSetAtom(triggerZoomAtom);
  useEffect(() => {
    setTriggerZoom((action) => {
      switch (action) {
        case "in":
          containerElRef.current?.dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: -350,
              ctrlKey: true,
              bubbles: true,
              detail: -1,
            }),
          );
          return;
        case "out":
          containerElRef.current?.dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: 350,
              ctrlKey: true,
              bubbles: true,
              detail: -1,
            }),
          );
          return;
        case "reset":
          setZoomRange(undefined);
          return;
      }
    });
  }, [setTriggerZoom, setZoomRange]);

  useEffect(() => {
    if (!containerElRef.current) return;

    const hammer = new Hammer(containerElRef.current);

    hammer.add(
      new Hammer.Pan({ event: "pan", direction: Hammer.DIRECTION_HORIZONTAL }),
    );

    hammer.on("panleft panright", (e) => {
      if (!e.pointerType.includes("touch")) return;

      containerElRef.current?.dispatchEvent(
        new WheelEvent("wheel", {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          deltaX: -(e.changedPointers[0]?.["movementX"] ?? 0) * 10,
          shiftKey: true,
          bubbles: true,
          detail: -1,
        }),
      );
    });

    hammer.get("pinch").set({ enable: true, pointers: 2 });
    hammer.on("pinchout", (e) => {
      if (!e.pointerType.includes("touch")) return;

      containerElRef.current?.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -e.scale * 100,
          ctrlKey: true,
          bubbles: true,
          detail: -1,
        }),
      );
    });

    hammer.on("pinchin", (e) => {
      if (!e.pointerType.includes("touch")) return;

      containerElRef.current?.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: e.scale * 100,
          ctrlKey: true,
          bubbles: true,
          detail: -1,
        }),
      );
    });

    return () => {
      hammer.destroy();
    };
  }, []);

  const useActiveBanksLargeStroke = xDomain[1] - xDomain[0] < smNanosThreshold;
  const useActiveBanksMdStroke =
    !useActiveBanksLargeStroke && xDomain[1] - xDomain[0] < mdNanosThreshold;

  const tEnd =
    0.95 *
    Number(
      computeUnits.target_end_timestamp_nanos -
        computeUnits.start_timestamp_nanos,
    );

  const prevPolyPoints = useRef<[Coordinate, Coordinate][]>([]);
  prevPolyPoints.current = [];

  const graphRectProps = useRef<RectangleProps>();

  return (
    <div
      className={clsx(styles.chartWrapper, {
        [styles.panning]: isPanning && isZoomed,
        [styles.nopan]: isPanning && !isZoomed,
        [styles.zooming]: isActiveDragging,
        [styles.modKeyDown]: isModKeyDown && isZoomed,
      })}
      ref={containerElRef}
      onWheel={onWheel}
      onMouseMove={onContainerMouseMove}
      onMouseOut={onContainerMouseOut}
    >
      <AutoSizer onResize={(size) => setChartWidth(size.width)}>
        {({ height, width }) => {
          return (
            <LineChart
              width={width}
              height={height}
              data={data}
              margin={{
                top: 10,
                right: 15,
                left: 8,
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onDoubleClick={() => setZoomRange(undefined)}
            >
              <CartesianGrid stroke="#C6C6C6" opacity={0.1} />
              <Line
                yAxisId={bankCountAxisId}
                type="stepAfter"
                dataKey="activeBankCount"
                stroke="#BA7B1D"
                strokeWidth={
                  useActiveBanksLargeStroke
                    ? 0.9
                    : useActiveBanksMdStroke
                      ? 0.6
                      : 0.2
                }
                dot={false}
                name="banks active"
                isAnimationActive={false}
              />
              {segments.map((segment, i) => {
                return (
                  <ReferenceLine
                    key={`line-${i}`}
                    segment={segment}
                    stroke={getSegmentColor(i).fill}
                    strokeDasharray="3 3"
                    yAxisId={cuAxisId}
                    strokeWidth={1}
                  />
                );
              })}
              <ReferenceArea
                yAxisId={cuAxisId}
                x1={xDomain[0]}
                x2={xDomain[1]}
                y1={yDomain[0]}
                y2={Math.min(yDomain[1], computeUnits.max_compute_units)}
                shape={(props) => {
                  graphRectProps.current = props as RectangleProps;
                  return <></>;
                }}
              />
              {segments.map((segment, i) => {
                return (
                  <ReferenceLine
                    key={`area-${i}`}
                    segment={segment}
                    yAxisId={cuAxisId}
                    shape={(props: {
                      x1: number;
                      y1: number;
                      x2: number;
                      y2: number;
                    }) => {
                      const points: [Coordinate, Coordinate] = [
                        { x: props.x1, y: props.y1 },
                        { x: props.x2, y: props.y2 },
                      ];
                      prevPolyPoints.current[i] = [...points];

                      const leftAxisLinePoints = [
                        {
                          x: graphRectProps.current?.x ?? 0,
                          y:
                            (graphRectProps.current?.y ?? 0) +
                            (graphRectProps.current?.height ?? 0),
                        },
                        {
                          x: graphRectProps.current?.x ?? 0,
                          y: graphRectProps.current?.y ?? 0,
                        },
                      ];

                      return (
                        <Polygon
                          points={getPolygonPoints(
                            prevPolyPoints.current[i - 1] ?? leftAxisLinePoints,
                            points,
                          )}
                          fillOpacity={getSegmentColor(i).opacity}
                          fill={getSegmentColor(i).fill}
                          className={styles.bankRefArea}
                        />
                      );
                    }}
                  />
                );
              })}

              <ReferenceLine
                x={xDomain[0]}
                yAxisId={cuAxisId}
                shape={() => {
                  if (!prevPolyPoints.current.length) {
                    const bankCount = Math.min(
                      bankTileCount,
                      Math.abs(
                        getBankCount({
                          computeUnits: yDomain[1] - yDomain[0] + yDomain[0],
                          ts: xDomain[1] - xDomain[0] + xDomain[0],
                          tEnd,
                          maxComputeUnits: computeUnits.max_compute_units,
                        }),
                      ),
                    );

                    return (
                      <Rectangle
                        {...graphRectProps.current}
                        fill={getSegmentColor(bankCount).fill}
                        fillOpacity={getSegmentColor(bankCount).opacity}
                      />
                    );
                  }

                  const rightAxisLinePoints: [Coordinate, Coordinate] = [
                    {
                      x:
                        (graphRectProps.current?.x ?? 0) +
                        (graphRectProps.current?.width ?? 0),
                      y:
                        (graphRectProps.current?.y ?? 0) +
                        (graphRectProps.current?.height ?? 0),
                    },
                    {
                      x:
                        (graphRectProps.current?.x ?? 0) +
                        (graphRectProps.current?.width ?? 0),
                      y: graphRectProps.current?.y ?? 0,
                    },
                  ];

                  return (
                    <Polygon
                      points={getPolygonPoints(
                        prevPolyPoints.current[
                          prevPolyPoints.current.length - 1
                        ],
                        rightAxisLinePoints,
                      )}
                      fillOpacity={
                        getSegmentColor(prevPolyPoints.current.length).opacity
                      }
                      className={styles.bankRefArea}
                      fill={getSegmentColor(prevPolyPoints.current.length).fill}
                    />
                  );
                }}
              />
              <ReferenceLine
                y={computeUnits.max_compute_units}
                stroke="#2a7edf"
                strokeDasharray="3 3"
                yAxisId={cuAxisId}
                strokeWidth={0.4}
              />
              <Line
                yAxisId={cuAxisId}
                type="stepAfter"
                dataKey="computeUnits"
                stroke="#1288F6"
                strokeWidth={1.3}
                dot={false}
                name="CUs"
                isAnimationActive={false}
              />
              <XAxis
                dataKey="timestampNanos"
                scale="time"
                type="number"
                interval={0}
                ticks={xTicks}
                tickFormatter={(tick) =>
                  typeof tick === "number" ? `${tick / 1_000_000}ms` : `${tick}`
                }
                domain={xDomain as AxisDomain}
                allowDataOverflow
              />
              <YAxis
                yAxisId={cuAxisId}
                scale="linear"
                type="number"
                domain={yDomain as AxisDomain}
                ticks={cuDomain ? undefined : defaultCuTicks}
                allowDataOverflow={!!cuDomain}
                minTickGap={0}
                orientation="right"
                tickFormatter={(tick) => {
                  if (typeof tick !== "number") return "";

                  return `${tick / 1_000_000}M`;
                }}
              />
              <YAxis
                yAxisId={bankCountAxisId}
                scale="linear"
                type="number"
                domain={[0, (dataMax: number) => dataMax + 1]}
                ticks={activeBankCountTicks}
                hide
                name="active bank tiles"
              />

              {isActiveDragging && (
                <ReferenceArea
                  x1={dragRange[0]}
                  x2={dragRange[1]}
                  opacity={0.5}
                  ifOverflow="hidden"
                  yAxisId="computeUnits"
                />
              )}
              <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
            </LineChart>
          );
        }}
      </AutoSizer>
    </div>
  );
}
