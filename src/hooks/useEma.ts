import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseEmaOptions {
  forceUpdateIntervalMs?: number;
  halfLifeMs?: number;
}

const defaultUseEmaOptions = {
  forceUpdateIntervalMs: 1_000,
  halfLifeMs: 10_000,
} as const;

export function useEma(
  cumulativeValue: number | null | undefined,
  { forceUpdateIntervalMs, halfLifeMs }: UseEmaOptions = defaultUseEmaOptions,
) {
  const tauMs = useMemo(
    () => (halfLifeMs ?? defaultUseEmaOptions.halfLifeMs) / Math.log(2),
    [halfLifeMs],
  );

  const [ema, setEma] = useState<number>();

  const prevValueRef = useRef<{
    value: number;
    tsMs: number;
  }>();

  const cumulativeValueRef = useRef(cumulativeValue);
  cumulativeValueRef.current = cumulativeValue;

  const reset = useCallback(() => {
    setEma(undefined);
    prevValueRef.current = undefined;
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const tick = useCallback(
    (value?: number | null) => {
      value ??= cumulativeValueRef.current;
      const tsMs = performance.now();

      if (prevValueRef.current === undefined) {
        if (value != null) {
          prevValueRef.current = { value, tsMs };
        }
        return;
      }

      // Decay with the last cumulative value if no value given
      value ??= prevValueRef.current.value;

      const { value: prevValue, tsMs: prevTsMs } = prevValueRef.current;

      const deltaTsMs = tsMs - prevTsMs;
      if (!isFinite(deltaTsMs) || deltaTsMs <= 0) {
        return;
      }

      // Currently only works with an always increasing cumulative value
      // Reset ema if the cumulative value goes backwards
      const deltaValue = value - prevValue;
      if (!isFinite(deltaValue) || deltaValue < 0) {
        reset();
        return;
      }

      prevValueRef.current = { value, tsMs };

      setEma((prevEma) => {
        const ratePerSec = (deltaValue / deltaTsMs) * 1_000;
        if (prevEma === undefined) return ratePerSec;
        // Numerically stable weight: w = 1 - exp(-dt/τ) == -expm1(-dt/τ)
        const w = -Math.expm1(-deltaTsMs / tauMs);
        const newEma = prevEma * (1 - w) + ratePerSec * w;
        return newEma;
      });
    },
    [reset, tauMs],
  );

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    tick(cumulativeValue);

    if (forceUpdateIntervalMs !== undefined) {
      function loop() {
        timeoutRef.current = setTimeout(() => {
          tick();
          loop();
        }, forceUpdateIntervalMs);
      }
      loop();
    }

    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [forceUpdateIntervalMs, tick, cumulativeValue]);

  return { ema, reset };
}

export function useEmaValue(
  cumulativeValue: number | null | undefined,
  options: UseEmaOptions = defaultUseEmaOptions,
) {
  return useEma(cumulativeValue, options).ema ?? 0;
}
