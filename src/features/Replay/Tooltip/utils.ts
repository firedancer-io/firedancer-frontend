import { DateTime } from "luxon";
import { nsPerMs, solDecimals } from "../../../consts";
import { getDurationWithUnits } from "../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import { formatNumberLamports } from "../../Overview/ValidatorsCard/formatAmt";

/** format an absolute ns timestamp as a tooltip time (h:mm:ss.SSS) */
export function formatTooltipTime(absNs: bigint) {
  return DateTime.fromMillis(Number(absNs / BigInt(nsPerMs))).toFormat(
    "h:mm:ss.SSS",
  );
}

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

export function msToDurationUnits(durationMs: number | undefined): {
  value: number | undefined;
  unit?: string;
} {
  if (durationMs === undefined) return { value: undefined };
  return getDurationWithUnits(durationMs * nsPerMs);
}
