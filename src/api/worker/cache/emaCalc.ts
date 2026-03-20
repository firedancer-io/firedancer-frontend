export interface EmaCalcOptions {
  halfLifeMs: number;
  initMinSamples: number;
  warmupMs?: number;
}

export function createEmaCalc(opts: EmaCalcOptions) {
  const tauMs = opts.halfLifeMs / Math.log(2);
  const { initMinSamples, warmupMs } = opts;

  let ema: number | undefined;
  let prev: { value: number; tsMs: number } | undefined;
  let samples = 0;
  let initMs: number | undefined;

  function reset() {
    prev = undefined;
    samples = 0;
    ema = undefined;
    initMs = undefined;
  }

  function effectiveTau(nowMs: number) {
    if (!warmupMs || !initMs) return tauMs;
    const warmup = Math.max(0.2, Math.min(1, (nowMs - initMs) / warmupMs));
    return tauMs * warmup;
  }

  /** Tick with a new cumulative value (or null/undefined to apply decay) */
  function tick(value: number | null | undefined, nowMs: number): boolean {
    if (!prev) {
      // Initial sample
      if (value != null) {
        prev = { value, tsMs: nowMs };
      }
      return false;
    }

    value ??= prev.value;

    const dtMs = nowMs - prev.tsMs;
    if (!isFinite(dtMs) || dtMs <= 0) return false;

    const dtValue = value - prev.value;
    // if cumulative total gets smaller, reset series
    if (!isFinite(dtValue) || dtValue < 0) {
      reset();
      prev = { value, tsMs: nowMs };
      return false;
    }

    prev = { value, tsMs: nowMs };

    if (ema === undefined) {
      // Only consider sample for initial EMA when cumulative value changes
      if (dtValue <= 0) return false;
      samples += 1;
      if (samples < initMinSamples) return false;

      // Seed at 0 and let warmup converge to the real rate
      ema = 0;
      initMs = nowMs;
      return false;
    } else {
      const ratePerSec = (dtValue / dtMs) * 1_000;
      const tau = effectiveTau(nowMs);
      // expm1 avoids precision loss when dtMs is small relative to tauMs
      const w = -Math.expm1(-dtMs / tau);
      ema = ema * (1 - w) + ratePerSec * w;
    }

    return true;
  }

  return {
    get ema() {
      return ema;
    },
    reset,
    tick,
  };
}

export type EmaCalc = ReturnType<typeof createEmaCalc>;

/**
 * Computes EMAs for each element in a fixed-size array of cumulative values.
 */
export function createEmaArrayCalc(opts: EmaCalcOptions) {
  const calcs: EmaCalc[] = [];
  let ema: number[] = [];

  function reset() {
    for (const calc of calcs) {
      calc.reset();
    }
    ema = [];
  }

  /** Tick with an array of new cumulative values (or null/undefined to apply decay) */
  function tick(values: number[] | null | undefined, nowMs: number): boolean {
    let anyUpdated = false;

    // Decay all emas
    if (values == null) {
      for (let i = 0; i < calcs.length; i++) {
        if (calcs[i].tick(undefined, nowMs)) {
          anyUpdated = true;
        }
      }
      if (anyUpdated) {
        ema = calcs.map((c) => c.ema ?? 0);
      }
      return anyUpdated;
    }

    while (calcs.length < values.length) {
      calcs.push(createEmaCalc(opts));
    }

    for (let i = 0; i < values.length; i++) {
      if (calcs[i].tick(values[i], nowMs)) {
        anyUpdated = true;
      }
    }
    if (anyUpdated) {
      ema = calcs.map((c) => c.ema ?? 0);
    }
    return anyUpdated;
  }

  return {
    get ema() {
      return ema;
    },
    reset,
    tick,
  };
}

export type EmaArrayCalc = ReturnType<typeof createEmaArrayCalc>;
