import { Flex, Text } from "@radix-ui/themes";
import type { SlotTransactions } from "../../../../api/types";
import DistributionBar from "./DistributionBars";
import { useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { groupBy, sum } from "lodash";

type SpreadResult = {
  n: number;
  total: number;
  // Cumulative: "top1%" is share of sum in the largest ceil(n*1%) items.
  // Also includes "rest" = 1 - top(maxPercentile)%.
  cumulative: Record<string, number>;
  // Disjoint bands: "top0-1%", "top1-10%", and "rest" (last band to 100%).
  disjoint: Record<string, number>;
  // For reference/debugging: how many items each cumulative threshold includes.
  thresholds: { percentile: number; count: number }[];
};

/**
 * Compute contribution-to-sum by top percentiles of items.
 * Example: with percentiles [1, 10], returns share for top1%, top10% (cumulative),
 * and disjoint bands 0–1%, 1–10%, and the rest.
 *
 * Notes:
 * - Items are ranked by value (descending).
 * - If total sum is 0, shares are returned as 0 to avoid NaNs.
 * - Non-finite values (NaN/±Infinity) are ignored.
 */
function topPercentileSpread(
  values: number[],
  percentiles: number[] = [1, 10],
): SpreadResult {
  // Filter to finite numbers
  const arr = values;
  const n = arr.length;

  // Empty input handling
  if (n === 0) {
    return {
      n: 0,
      total: 0,
      cumulative: {},
      disjoint: {},
      thresholds: [],
    };
  }

  // Sort descending by value (largest first)
  arr.sort((a, b) => b - a);

  // Prefix sums for fast top-k sums: prefix[i] = sum of first i items (i in [0..n])
  const prefix = new Array<number>(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + arr[i];

  const total = prefix[n];

  // Normalize, de-dup, and sort requested percentiles
  const ps = Array.from(
    new Set(percentiles.map((p) => Math.max(0, Math.min(100, p)))),
  ).sort((a, b) => a - b);

  // Helper: number of items included for top p%
  const countForPercentile = (p: number) => {
    if (p <= 0) return 0;
    if (p >= 100) return n;
    return Math.min(n, Math.max(0, Math.ceil((p / 100) * n)));
  };

  // Build cumulative shares
  const cumulative: Record<string, number> = {};
  const thresholds: { percentile: number; count: number }[] = [];

  for (const p of ps) {
    const k = countForPercentile(p);
    const topSum = prefix[k];
    const share = total === 0 ? 0 : topSum / total;
    cumulative[`top${p}%`] = share;
    thresholds.push({ percentile: p, count: k });
  }

  // Add a convenience "rest" relative to the largest requested percentile
  const maxP = ps.length ? ps[ps.length - 1] : 0;
  const maxK = countForPercentile(maxP);
  const restShare = total === 0 ? 0 : (total - prefix[maxK]) / total;
  cumulative["rest"] = restShare;

  // Build disjoint band shares for [0, p1], (p1, p2], ..., (plast, 100]
  const disjoint: Record<string, number> = {};
  const bounds = [0, ...ps, 100];

  for (let i = 1; i < bounds.length; i++) {
    const p0 = bounds[i - 1];
    const p1 = bounds[i];
    const k0 = countForPercentile(p0);
    const k1 = countForPercentile(p1);
    const bandSum = prefix[k1] - prefix[k0];
    const share = total === 0 ? 0 : bandSum / total;

    const key = i === bounds.length - 1 ? "rest" : `top${p0}-${p1}%`;

    disjoint[key] = share;
  }

  return { n, total, cumulative, disjoint, thresholds };
}

function getIncomeChartData(transactions: SlotTransactions) {
  const income = transactions.txn_tips.map((_, i) => {
    return Number(getTxnIncome(transactions, i));
  }, []);

  const a = topPercentileSpread(income);
  return a;
}

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}
export default function IncomeByPctTxns({ transactions }: IncomeByTxnProps) {
  const data = useMemo(() => {
    const data = getIncomeChartData(transactions);
    return Object.entries(data.disjoint).map(([label, value]) => {
      return { value, label };
    });
  }, [transactions]);

  // const dataa = useMemo(() => {
  //   const bundleValues = transactions.txn_from_bundle.map((fromBundle, i) => {
  //     return {
  //       value: Number(getTxnIncome(transactions, i)),
  //       label: fromBundle ? "Bundle" : "Other",
  //     };
  //   });

  //   return Object.values(groupBy(bundleValues, ({ label }) => label)).map(
  //     (grouped) => ({
  //       label: grouped[0].label,
  //       value: sum(grouped.map(({ value }) => value)),
  //     }),
  //   );
  // }, [transactions]);

  return (
    <Flex direction="column">
      <Text style={{ color: "var(--gray-12)" }}>
        Income Distribution by Percent Txns
      </Text>
      <DistributionBar data={data} />
    </Flex>
  );
}
