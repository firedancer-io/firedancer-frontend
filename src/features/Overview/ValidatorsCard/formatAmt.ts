import { lamportsPerSol } from "../../../consts";
import { formatNumber } from "../../../numUtils";

export function formatNumberLamports(value: number) {
  const solValue = value / lamportsPerSol;

  if (solValue < 1) return solValue.toFixed(3);
  

  return formatNumber(solValue, {
    useSuffix: true,
    significantDigits: 4,
    trailingZeroes: false,
    decimalsOnZero: false,
  });
}
