import { lamportsPerSol } from "../../../consts";
import { formatNumber } from "../../../numUtils";

export function formatNumberLamports(value: number, decimalCount: number = 3) {
  if(value === 0) return "0";

  const solValue = value / lamportsPerSol;

  if (solValue < 1) return solValue.toFixed(decimalCount);

  return formatNumber(solValue, {
    useSuffix: true,
    significantDigits: 4,
    trailingZeroes: false,
    decimalsOnZero: false,
  });
}
