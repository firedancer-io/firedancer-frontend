import { useCallback, useEffect, useMemo, useState } from "react";
import { useInterval } from "react-use";

/**
 * Append new value, and delete stale values.
 * Keep at least 2 values to continue supporting rate calc
 */
function addNewValueAndShift(
  prev: [number, number][],
  newValue: number,
  windowMs: number,
  now: number,
) {
  const newValues = [...prev, [newValue, now]] satisfies [number, number][];

  while (
    // keep at least two for rate calc
    newValues.length > 2 &&
    newValues[0] &&
    newValues[0][1] <= now - windowMs
  ) {
    newValues.shift();
  }
  return newValues;
}

export function useValuePerSecond(
  cumulativeValue?: number | null,
  windowMs = 500,
  paused = false,
) {
  // array of [cumulative value, time]
  const [values, setValues] = useState<[number, number][]>([]);

  useEffect(() => {
    if (cumulativeValue == null) return;
    setValues((prev) =>
      addNewValueAndShift(prev, cumulativeValue, windowMs, performance.now()),
    );
  }, [cumulativeValue, windowMs]);

  // Handle unchanged cumulative values by
  // adding the unchanged value to the end of the array
  useInterval(() => {
    if (paused) return;
    const now = performance.now();
    setValues((prev) => {
      const latestValue = prev[prev.length - 1];
      if (latestValue && latestValue[1] < now - windowMs) {
        return addNewValueAndShift(
          prev,
          prev[prev.length - 1][0],
          windowMs,
          now,
        );
      } else {
        return prev;
      }
    });
  }, windowMs);

  const reset = useCallback(() => {
    setValues([]);
  }, []);

  const valuePerSecond = useMemo(() => {
    if (values.length <= 1) return;

    return (
      (1_000 * (values[values.length - 1][0] - values[0][0])) /
      (values[values.length - 1][1] - values[0][1])
    );
  }, [values]);

  return {
    valuePerSecond,
    reset,
  };
}
