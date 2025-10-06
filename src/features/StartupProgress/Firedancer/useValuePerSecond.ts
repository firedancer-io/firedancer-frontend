import { useEffect, useMemo, useState } from "react";

export function useValuePerSecond(cumulativeValue?: number | null) {
  const [values, setValues] = useState<[number, number][]>([]);

  useEffect(() => {
    if (cumulativeValue == null) return;

    const now = performance.now();
    setValues((prev) => {
      const newValues = [...prev, [cumulativeValue, now]] satisfies [
        number,
        number,
      ][];
      while (newValues[0] && newValues[0][1] <= now - 500) {
        newValues.shift();
      }
      return newValues;
    });
  }, [cumulativeValue]);

  return useMemo(() => {
    if (values.length <= 1) return;

    return (
      (1_000 * (values[values.length - 1][0] - values[0][0])) /
      (values[values.length - 1][1] - values[0][1])
    );
  }, [values]);
}
