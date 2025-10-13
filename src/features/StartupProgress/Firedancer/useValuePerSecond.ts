import { useCallback, useEffect, useMemo, useState } from "react";

export function useValuePerSecond(
  cumulativeValue?: number | null,
  windowMs = 500,
) {
  const [values, setValues] = useState<[number, number][]>([]);

  useEffect(() => {
    if (cumulativeValue == null) return;

    const now = performance.now();
    setValues((prev) => {
      const newValues = [...prev, [cumulativeValue, now]] satisfies [
        number,
        number,
      ][];
      while (
        newValues.length > 2 &&
        newValues[0] &&
        newValues[0][1] <= now - windowMs
      ) {
        newValues.shift();
      }
      return newValues;
    });
  }, [cumulativeValue, windowMs]);

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
