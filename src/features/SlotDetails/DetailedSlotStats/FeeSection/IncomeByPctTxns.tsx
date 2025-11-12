import type { SlotTransactions } from "../../../../api/types";
import DistributionBar from "./DistributionBars";
import { useMemo } from "react";
import { getTxnIncome } from "../../../../utils";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { clamp } from "lodash";

function percentileSpread(values: number[], percentiles: number[] = [1, 10]) {
  const n = values.length;
  if (n === 0) return;

  values = values.toSorted((a, b) => b - a);

  // Prefix sums for fast top-k sums: prefix[i] = sum of first i items (i in [0..n])
  const prefix = new Array<number>(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + values[i];
  }

  const total = prefix[n];

  // Normalize, de-dup, and sort requested percentiles
  const ps = Array.from(new Set(percentiles.map((p) => clamp(p, 0, 100)))).sort(
    (a, b) => a - b,
  );

  const countForPercentile = (p: number) => {
    if (p <= 0) return 0;
    if (p >= 100) return n;
    return clamp(Math.ceil((p / 100) * n), 0, n);
  };

  const disjoint: Record<string, number> = {};
  const bounds = [0, ...ps, 100];

  for (let i = 1; i < bounds.length; i++) {
    const p0 = bounds[i - 1];
    const p1 = bounds[i];
    const k0 = countForPercentile(p0);
    const k1 = countForPercentile(p1);
    const bandSum = prefix[k1] - prefix[k0];
    const share = total === 0 ? 0 : bandSum / total;

    const key = i === bounds.length - 1 ? "other" : `top${p0}-${p1}%`;

    disjoint[key] = share;
  }

  return disjoint;
}

function getIncomeChartData(transactions: SlotTransactions) {
  const income = transactions.txn_tips.map((_, i) => {
    return Number(getTxnIncome(transactions, i));
  }, []);

  const percentiles = percentileSpread(income);
  if (percentiles === undefined) return;

  return Object.entries(percentiles).map(([label, value]) => {
    return { value, label };
  });
}

interface IncomeByTxnProps {
  transactions: SlotTransactions;
}
export default function IncomeByPctTxns({ transactions }: IncomeByTxnProps) {
  const data = useMemo(() => getIncomeChartData(transactions), [transactions]);

  if (!data) return;

  return (
    <SlotDetailsSubSection title="Income Distribution by Percent Txns">
      <DistributionBar data={data} />
    </SlotDetailsSubSection>
  );
}
