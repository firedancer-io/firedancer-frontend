import { lamportsPerSol, solDecimals } from "../../../consts";
import type { FormatNumberOptions } from "../../../numUtils";
import { formatNumber } from "../../../numUtils";

export function formatNumberLamports(
  value: bigint | number,
  decimalCount: number = solDecimals,
  formatOptions?: FormatNumberOptions,
) {
  if (!value) return "0";

  const solValue = Number(value) / lamportsPerSol;

  if (solValue < 1) return solValue.toFixed(decimalCount);

  return formatNumber(
    solValue,
    formatOptions ?? {
      useSuffix: true,
      significantDigits: 4,
      trailingZeroes: false,
      decimalsOnZero: false,
    },
  );
}
