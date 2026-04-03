import { mean } from "lodash";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInterval } from "react-use";
import { createClock } from "../../../clockUtils";

export const strokeLineWidth = 2;

interface UseTileSparklineProps {
  isLive: boolean;
  tileCount: number;
  liveIdlePerTile?: number[];
  queryIdlePerTile?: number[][];
}
export function useTileSparkline({
  isLive,
  tileCount,
  liveIdlePerTile,
  queryIdlePerTile,
}: UseTileSparklineProps) {
  const tileCountArr = useMemo<unknown[]>(
    () => new Array(tileCount).fill(0),
    [tileCount],
  );

  const liveBusyPerTile = useMemo(
    () => liveIdlePerTile?.map((idle) => (idle === -1 ? undefined : 1 - idle)),
    [liveIdlePerTile],
  );

  const aggQueryBusyPerTs = useMemo(
    () =>
      queryIdlePerTile
        ?.map((idlePerTile) => {
          const filtered = idlePerTile.filter((idle) => idle !== -1);
          if (!filtered.length) return;
          return 1 - mean(filtered);
        })
        .filter((v) => v !== undefined),
    [queryIdlePerTile],
  );

  const aggQueryBusyPerTile = useMemo(
    () =>
      tileCountArr.map((_, i) => {
        const queryIdle = queryIdlePerTile
          ?.map((idlePerTile) => 1 - idlePerTile[i])
          .filter((b) => b !== undefined && b <= 1);

        if (!queryIdle?.length) return;

        return mean(queryIdle);
      }),
    [tileCountArr, queryIdlePerTile],
  );

  const busy = useMemo(
    () =>
      (isLive ? liveBusyPerTile : aggQueryBusyPerTile)?.filter(
        (b) => b !== undefined && b <= 1,
      ),
    [isLive, liveBusyPerTile, aggQueryBusyPerTile],
  );
  const avgBusy = useMemo(
    () => (busy?.length ? mean(busy) : undefined),
    [busy],
  );

  return {
    avgBusy,
    aggQueryBusyPerTs,
    tileCountArr,
    liveBusyPerTile,
    busy,
  };
}

export function useLastDefinedValue(value: number | undefined) {
  const lastDefined = useRef<number | undefined>();
  if (value !== undefined) {
    lastDefined.current = value;
  }
  return value ?? lastDefined.current;
}

export type SparklineRange = [number, number];
export const sparkLineRange: SparklineRange = [0, 1];

interface PointSample {
  value: number | undefined;
  ts: number;
}

const defaultTickMs = 150;
/** How many ticks of extra buffer data is drawn for the transform to slide over */
const tickBufferCount = 3;

const clocks = new Map<number, ReturnType<typeof createClock>>();

function setDataWindow(
  data: (PointSample | undefined)[],
  windowMs: number,
  value: number | undefined,
  now: number,
) {
  data.push({ value, ts: now });

  // keep 1 extra point past the window so window always has a value at left most axis
  while ((data[1]?.ts ?? 0) + windowMs < now) {
    data.shift();
  }

  return data;
}

interface UseScaledDataPointsProps {
  value?: number;
  queryBusy?: number[];
  windowMs: number;
  height: number;
  width: number;
  updateIntervalMs: number;
  stopShifting?: boolean;
  tickMs?: number;
  /** Skip clock subscription and intervals (e.g. when off-screen) */
  paused?: boolean;
}

export function useScaledDataPoints({
  value,
  queryBusy,
  windowMs: _windowMs,
  height,
  width: _width,
  updateIntervalMs,
  stopShifting,
  tickMs = defaultTickMs,
  paused,
}: UseScaledDataPointsProps) {
  const [scaledDataPoints, setScaledDataPoints] = useState<
    { x: number; y: number }[]
  >([]);

  const { pxPerTick, width, windowMs } = useMemo(() => {
    let windowMs = _windowMs;
    let width = _width;
    const pxPerTick = width / (windowMs / tickMs);

    if (!queryBusy) {
      windowMs += tickMs * tickBufferCount;
      width += pxPerTick * tickBufferCount;
    }
    return {
      pxPerTick,
      width,
      windowMs,
    };
  }, [_width, _windowMs, queryBusy, tickMs]);

  const busyDataRef = useRef<(PointSample | undefined)[]>(undefined!);
  if (!busyDataRef.current) {
    const now = performance.now();
    busyDataRef.current = [
      { value: undefined, ts: now - windowMs },
      { value: undefined, ts: now },
    ];
  }

  useLayoutEffect(() => {
    if (stopShifting || queryBusy?.length) return;

    setDataWindow(busyDataRef.current, windowMs, value, performance.now());
  }, [queryBusy?.length, windowMs, stopShifting, value]);

  useInterval(
    () => {
      if (stopShifting || queryBusy?.length) return;

      const now = performance.now();
      const lastTs = busyDataRef.current[busyDataRef.current.length - 1]?.ts;
      // Don't add a artifical tick point if one was added within the specified update interval
      if (lastTs !== undefined && now - lastTs < updateIntervalMs) {
        return;
      }

      setDataWindow(busyDataRef.current, windowMs, value, now);
    },
    paused ? null : updateIntervalMs,
  );

  useEffect(() => {
    if (paused) return;
    function tick(data: (PointSample | undefined)[], tEnd: number) {
      const size = data.length;
      if (size === 0) {
        setScaledDataPoints([]);
        return;
      }

      const tStart = tEnd - windowMs;
      const scale = width / windowMs;

      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < size; i++) {
        const d = data[i];
        if (d === undefined && i === 0) {
          continue;
        }

        let dTs = d?.ts;
        if (dTs === undefined) {
          const nextTs = data[i + 1]?.ts ?? tEnd;
          const prevTs = data[i - 1]?.ts ?? 0;
          dTs = (nextTs - prevTs) / 2;
        }

        const prevPoint = points[points.length - 1];
        if (prevPoint === undefined && d?.value === undefined) continue;

        const x = (dTs - tStart) * scale;
        const y =
          d?.value !== undefined
            ? // make space for full line width on top and bottom edges
              (1 - d.value) * (height - strokeLineWidth) + strokeLineWidth / 2
            : (prevPoint.y ?? 0);

        points.push({ x, y });
      }

      setScaledDataPoints(points);
    }

    // historical query
    if (queryBusy) {
      const tEnd = performance.now();
      const ratio = windowMs / (queryBusy.length - 1);
      const tStart = tEnd - windowMs;
      const data = queryBusy.map((value, i) => {
        return { value, ts: tStart + i * ratio };
      });
      tick(data, tEnd);
    }
    // live
    else {
      if (!clocks.has(tickMs)) {
        clocks.set(tickMs, createClock(tickMs));
      }
      const clock = clocks.get(tickMs);
      if (clock) {
        const unsub = clock.subscribeClock((tEnd) => {
          tick(busyDataRef.current, tEnd);
        });

        return unsub;
      }
    }
  }, [height, paused, queryBusy, tickMs, width, windowMs]);

  return {
    scaledDataPoints,
    range: sparkLineRange,
    pxPerTick,
    chartTickMs: tickMs,
    isLive: !queryBusy,
  };
}
