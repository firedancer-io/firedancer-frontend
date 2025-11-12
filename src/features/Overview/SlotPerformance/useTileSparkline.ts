import { mean } from "lodash";
import { useMemo, useState } from "react";
import { useInterval } from "react-use";

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

  const liveBusyPerTile = liveIdlePerTile
    ?.filter((idle) => idle !== -1)
    .map((idle) => 1 - idle);

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

export type SparklineRange = [number, number];
export const sparkLineRange: SparklineRange = [0, 1];

interface UseScaledDataPointsProps {
  value?: number;
  queryBusy?: number[];
  rollingWindowMs: number;
  height: number;
  width: number;
  updateIntervalMs: number;
  stopShifting?: boolean;
}
export function useScaledDataPoints({
  value,
  queryBusy,
  rollingWindowMs,
  height,
  width,
  updateIntervalMs,
  stopShifting,
}: UseScaledDataPointsProps): {
  scaledDataPoints: {
    x: number;
    y: number;
  }[];
  range: SparklineRange;
} {
  const [busyData, setBusyData] = useState<(number | undefined)[]>([]);

  useInterval(() => {
    if (stopShifting || queryBusy?.length) return;

    setBusyData((prev) => {
      const newState = [...prev, value];
      if (newState.length >= Math.trunc(rollingWindowMs / updateIntervalMs)) {
        newState.shift();
      }
      return newState;
    });
  }, updateIntervalMs);

  const scaledDataPoints = useMemo((): { x: number; y: number }[] => {
    const data = queryBusy ?? busyData;

    // include all points in x spacing
    const xRatio = width / data.length;

    return data.reduce(
      (acc, d, i) => {
        if (d === undefined) return acc;

        acc.push({
          x: i * xRatio,
          // make space for full line width on top and bottom edges
          y: (1 - d) * (height - strokeLineWidth) + strokeLineWidth / 2,
        });
        return acc;
      },
      [] as { x: number; y: number }[],
    );
  }, [queryBusy, busyData, width, height]);

  return {
    scaledDataPoints,
    range: sparkLineRange,
  };
}
