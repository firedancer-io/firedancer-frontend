import { solDecimals } from "../../../consts";
import { formatNumberLamports } from "../../Overview/ValidatorsCard/formatAmt";

/** add two nullable lamport amounts; undefined if both are missing */
export function sumLamports(a?: bigint | null, b?: bigint | null) {
  if (a == null && b == null) return undefined;
  return (a ?? 0n) + (b ?? 0n);
}

/** format lamports to SOL string, or undefined when missing */
export function formatSol(lamports?: bigint) {
  if (lamports === undefined) return undefined;
  return formatNumberLamports(lamports, solDecimals, {
    decimals: solDecimals,
    trailingZeroes: true,
  });
}
