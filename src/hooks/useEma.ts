import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseEmaOptions {
  forceUpdateIntervalMs?: number;
  halfLifeMs?: number;
  /** How many cumulative value changes need to happen before first initializing ema */
  initMinSamples?: number;
}

const defaultUseEmaOptions = {
  forceUpdateIntervalMs: 1_500,
  halfLifeMs: 5_000,
  initMinSamples: 5,
} as const;

export function useEma(
  cumulativeValue: number | null | undefined,
  _options?: UseEmaOptions,
) {
  const { forceUpdateIntervalMs, halfLifeMs, initMinSamples } = {
    ...defaultUseEmaOptions,
    ..._options,
  };

  const tauMs = useMemo(() => halfLifeMs / Math.log(2), [halfLifeMs]);

  const [ema, setEma] = useState<number>();

  const prevValueRef = useRef<{
    value: number;
    tsMs: number;
  }>();

  const cumulativeValueRef = useRef(cumulativeValue);
  cumulativeValueRef.current = cumulativeValue;
  const firstSampleRef = useRef<{ value: number; tsMs: number }>();
  const sampleCountRef = useRef(0);
  const hasEmaRef = useRef(false);
  hasEmaRef.current = ema !== undefined;

  const reset = useCallback(() => {
    setEma(undefined);

    prevValueRef.current = undefined;
    firstSampleRef.current = undefined;
    sampleCountRef.current = 0;

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

      // collect samples until initMinSamples before setting ema
      if (!hasEmaRef.current && deltaValue > 0) {
        sampleCountRef.current += 1;
        if (!firstSampleRef.current) {
          firstSampleRef.current = { value, tsMs };
          return;
        }

        if (sampleCountRef.current < initMinSamples) {
          return;
        }

        // init EMA from average rate over sampled window
        const elapsed = tsMs - firstSampleRef.current.tsMs;
        const totalDelta = value - firstSampleRef.current.value;
        const initRate = (totalDelta / elapsed) * 1_000;
        setEma(initRate);
        return;
      }

      setEma((prevEma) => {
        const ratePerSec = (deltaValue / deltaTsMs) * 1_000;
        if (prevEma === undefined) {
          // So that we won't start with using the syntethic tick of delta = 0
          return ratePerSec > 0 ? ratePerSec : prevEma;
        }
        // Numerically stable weight: w = 1 - exp(-dt/τ) == -expm1(-dt/τ)
        const w = -Math.expm1(-deltaTsMs / tauMs);
        const newEma = prevEma * (1 - w) + ratePerSec * w;
        return newEma;
      });
    },
    [initMinSamples, reset, tauMs],
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
