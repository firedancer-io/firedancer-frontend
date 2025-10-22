import memoize from "micro-memoize";

export function getNumOfDecimals(a: number) {
  if (!isFinite(a) || a < 1e-32) return 0;
  let p = 0;
  while (a < 1) {
    a *= 10;
    p++;
  }
  return p;
}

export interface NumberFormatOptions {
  decimals?: number;
  significantDigits?: number;
  trailingZeroes?: boolean;
}

const nfMemo = memoize(
  (decimals?: number, significantDigits?: number, trailingZeroes?: boolean) => {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: !trailingZeroes ? 0 : decimals,
      maximumFractionDigits: decimals,
      // If significant digits is set, NumberFormat will ignore the decimal digits
      minimumSignificantDigits:
        !trailingZeroes && significantDigits ? 1 : significantDigits,
      maximumSignificantDigits: significantDigits,
    });
  },
  { maxSize: 100 },
);

export type FormatNumberOptions =
  | {
      decimals: number | ((value: number) => number);
      trailingZeroes?: boolean;
      decimalsOnZero?: boolean;
      useSuffix?: boolean;
    }
  | {
      significantDigits: number;
      exactIntegers?: boolean;
      trailingZeroes?: boolean;
      decimalsOnZero?: boolean;
      useSuffix?: boolean;
    };

/**
 * Formats a numerical value with a fixed number of decimals or significant digits.
 */
export function formatNumber(value: number, opts: FormatNumberOptions): string {
  const { trailingZeroes = true, decimalsOnZero = false } = opts;
  if (value === 0 && !decimalsOnZero) return "0";

  let nf: Intl.NumberFormat;
  if ("decimals" in opts) {
    const decimals =
      typeof opts.decimals === "function"
        ? opts.decimals(value)
        : opts.decimals;
    nf = nfMemo(decimals, undefined, trailingZeroes);
  } else {
    const { significantDigits, exactIntegers } = opts;
    if (exactIntegers && Math.abs(value) > Math.pow(10, significantDigits)) {
      nf = nfMemo(0, undefined, trailingZeroes);
    } else {
      nf = nfMemo(undefined, significantDigits || 1, trailingZeroes);
    }
  }

  let suffix = "";
  if (opts.useSuffix) {
    [value, suffix] = numberSuffix(value);
  }

  const valueStr = nf.format(value);
  return valueStr === "-0" ? "0" : valueStr + suffix;
}

/** Returns a tuple consisting of the reduced value and a suffix (K, M, B, T) appropriate
 * for the order of magnitude of `value`. */
export function numberSuffix(value: number): [number, string] {
  if (isFinite(value)) {
    const absVal = Math.abs(value);
    if (absVal >= 1e12) return [value / 1e12, "T"];
    if (absVal >= 1e9) return [value / 1e9, "B"];
    if (absVal >= 1e6) return [value / 1e6, "M"];
    if (absVal >= 1e3) return [value / 1e3, "K"];
  }

  return [value, ""];
}

export function getNumOfCommonLeadingDigits(a: number, b: number): number {
  const aStr = a.toString();
  const bStr = b.toString();
  for (let i = 0; i < aStr.length; i++) {
    if (aStr[i] !== bStr[i]) return i;
  }

  return aStr.length;
}

export const compactSingleDecimalFormatter = Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
