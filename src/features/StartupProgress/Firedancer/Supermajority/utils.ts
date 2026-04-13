import { lamportsPerSol } from "../../../../consts";

const stakeFormatter = Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  minimumSignificantDigits: 3,
  maximumSignificantDigits: 3,
});

export function formatStake(lamport: bigint | null | undefined) {
  if (lamport == null) return;

  const parts = stakeFormatter.formatToParts(Number(lamport) / lamportsPerSol);
  let formatted = "";
  let suffix = undefined;
  for (const { value, type } of parts) {
    if (type === "compact") {
      suffix = value;
    } else {
      formatted += value;
    }
  }

  return {
    formatted,
    suffix,
  };
}

/**
 * scale and unscale to keep precision with bigint division
 */
export function getStakePct(
  lamportsStake: bigint | undefined,
  totalStake: bigint | null | undefined,
  numDecimals: number,
) {
  if (lamportsStake == null || !totalStake) {
    return;
  }

  const scale = 10 ** numDecimals;
  const scaledPct = (100n * BigInt(scale) * lamportsStake) / totalStake;
  return Number(scaledPct) / scale;
}
