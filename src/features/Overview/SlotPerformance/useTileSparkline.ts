import { mean } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
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

  const liveBusyPerTile = liveIdlePerTile?.map((idle) =>
    idle === -1 ? undefined : 1 - idle,
  );

  const aggQueryBusyPerTs = queryIdlePerTile
    ?.map((idlePerTile) => {
      const filtered = idlePerTile.filter((idle) => idle !== -1);
      if (!filtered.length) return;
      return 1 - mean(filtered);
    })
    .filter((v) => v !== undefined);

  const aggQueryBusyPerTile = tileCountArr.map((_, i) => {
    const queryIdle = queryIdlePerTile
      ?.map((idlePerTile) => 1 - idlePerTile[i])
      .filter((b) => b !== undefined && b <= 1);

    if (!queryIdle?.length) return;

    return mean(queryIdle);
  });

  const busy = (isLive ? liveBusyPerTile : aggQueryBusyPerTile)?.filter(
    (b) => b !== undefined && b <= 1,
  );
  const avgBusy = busy?.length ? mean(busy) : undefined;

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
) {
  const now = performance.now();

  data.push({ value, ts: now });

  // keep 1 extra point past the window so window always has a value at left most axis
  while ((data[1]?.ts ?? 0) + windowMs < now) {
    data.shift();
  }

  return data;
}

function isNumberHistory(
  history: number[] | { ts: number; value: number }[],
): history is number[] {
  return typeof history[0] === "number";
}

interface UseScaledDataPointsProps {
  value?: number;
  value2?: number;
  history?: number[] | { ts: number; value: number }[];
  history2?: number[] | { ts: number; value: number }[];
  windowMs: number;
  height: number;
  width: number;
  updateIntervalMs: number;
  stopShifting?: boolean;
  tickMs?: number;
}

export function useScaledDataPoints({
  value,
  value2,
  history,
  history2,
  windowMs: _windowMs,
  height,
  width: _width,
  updateIntervalMs,
  stopShifting,
  tickMs = defaultTickMs,
}: UseScaledDataPointsProps) {
  const [scaledDataPoints, setScaledDataPoints] = useState<
    { x: number; y: number }[]
  >([]);
  const [scaledDataPoints2, setScaledDataPoints2] = useState<
    { x: number; y: number }[]
  >([]);

  const hasSeries2 = value2 !== undefined || !!history2?.length;

  const isStatic = !!(history?.length && value === undefined);

  // Adds ts to history without defined ts and normalizes to current time window. Assumes evenly spaced values
  const normalizedHistory = useMemo(() => {
    if (!history?.length) return;
    if (!isNumberHistory(history)) return history;

    const now = performance.now();
    const ratio = _windowMs / (history.length - 1);
    const tStart = now - _windowMs;
    return history.map((value, i) => ({ value, ts: tStart + i * ratio }));
  }, [_windowMs, history]);

  const normalizedHistory2 = useMemo(() => {
    if (!history2?.length) return;
    if (!isNumberHistory(history2)) return history2;

    const now = performance.now();
    const ratio = _windowMs / (history2.length - 1);
    const tStart = now - _windowMs;
    return history2.map((value, i) => ({ value, ts: tStart + i * ratio }));
  }, [_windowMs, history2]);

  const { pxPerTick, width, windowMs } = useMemo(() => {
    let windowMs = _windowMs;
    let width = _width;
    const pxPerTick = width / (windowMs / tickMs);

    if (!isStatic) {
      windowMs += tickMs * tickBufferCount;
      width += pxPerTick * tickBufferCount;
    }
    return {
      pxPerTick,
      width,
      windowMs,
    };
  }, [_width, _windowMs, isStatic, tickMs]);

  const dataRef = useRef<PointSample[]>([
    { value: undefined, ts: performance.now() - windowMs },
    { value: undefined, ts: performance.now() },
  ]);
  const dataRef2 = useRef<PointSample[]>([
    { value: undefined, ts: performance.now() - windowMs },
    { value: undefined, ts: performance.now() },
  ]);

  const isSeededRef = useRef(false);
  const isSeededRef2 = useRef(false);

  useEffect(() => {
    if (isSeededRef.current || !normalizedHistory?.length) return;
    isSeededRef.current = true;

    const now = performance.now();
    const newestTs = normalizedHistory[normalizedHistory.length - 1].ts;

    dataRef.current = normalizedHistory.map(({ ts, value }) => ({
      value,
      ts: now - (newestTs - ts),
    }));
  }, [normalizedHistory]);

  useEffect(() => {
    if (isSeededRef2.current || !normalizedHistory2?.length) return;
    isSeededRef2.current = true;

    const now = performance.now();
    const newestTs = normalizedHistory2[normalizedHistory2.length - 1].ts;

    dataRef2.current = normalizedHistory2.map(({ ts, value }) => ({
      value,
      ts: now - (newestTs - ts),
    }));
  }, [normalizedHistory2]);

  useEffect(() => {
    if (stopShifting || isStatic) return;

    setDataWindow(dataRef.current, windowMs, value);
    if (hasSeries2) setDataWindow(dataRef2.current, windowMs, value2);
  }, [isStatic, windowMs, stopShifting, value, value2, hasSeries2]);

  useInterval(() => {
    if (stopShifting || isStatic) return;

    const lastTs = dataRef.current[dataRef.current.length - 1]?.ts;
    // Don't add a artifical tick point if one was added within the specified update interval
    if (lastTs !== undefined && performance.now() - lastTs < updateIntervalMs) {
      return;
    }

    setDataWindow(dataRef.current, windowMs, value);
    if (hasSeries2) setDataWindow(dataRef2.current, windowMs, value2);
  }, updateIntervalMs);

  useEffect(() => {
    function buildPoints(data: (PointSample | undefined)[], tEnd: number) {
      const size = data.length;
      if (size === 0) return [];

      const tStart = tEnd - windowMs;
      const scale = width / windowMs;

      const points = new Array<{ x: number; y: number }>(size);
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

        const prevPoint = points[i - 1];
        if (prevPoint === undefined && d?.value === undefined) continue;

        const x = (dTs - tStart) * scale;
        const y =
          d?.value !== undefined
            ? // make space for full line width on top and bottom edges
              (1 - d.value) * (height - strokeLineWidth) + strokeLineWidth / 2
            : (prevPoint.y ?? 0);

        points[i] = { x: x, y: y };
      }

      return points;
    }

    function tick(
      data: (PointSample | undefined)[],
      data2: (PointSample | undefined)[] | undefined,
      tEnd: number,
    ) {
      setScaledDataPoints(buildPoints(data, tEnd));
      if (data2) setScaledDataPoints2(buildPoints(data2, tEnd));
    }

    if (isStatic) {
      if (!normalizedHistory?.length) return;

      const tEnd = performance.now();
      const newestTs = normalizedHistory[normalizedHistory.length - 1].ts;
      const data = normalizedHistory.map(({ ts, value }) => ({
        value,
        ts: tEnd - (newestTs - ts),
      }));
      const data2 = normalizedHistory2?.length
        ? normalizedHistory2.map(({ ts, value }) => ({
            value,
            ts: tEnd - (newestTs - ts),
          }))
        : undefined;

      tick(data, data2, tEnd);
    }
    // live
    else {
      if (!clocks.has(tickMs)) {
        clocks.set(tickMs, createClock(tickMs));
      }
      const clock = clocks.get(tickMs);
      if (clock) {
        const unsub = clock.subscribeClock((tEnd) => {
          tick(
            dataRef.current,
            hasSeries2 ? dataRef2.current : undefined,
            tEnd,
          );
        });

        return unsub;
      }
    }
  }, [
    height,
    normalizedHistory,
    normalizedHistory2,
    isStatic,
    tickMs,
    width,
    windowMs,
    hasSeries2,
  ]);

  return {
    scaledDataPoints,
    scaledDataPoints2: hasSeries2 ? scaledDataPoints2 : undefined,
    range: sparkLineRange,
    pxPerTick,
    chartTickMs: tickMs,
    isLive: !isStatic,
  };
}
