import { useRef, useMemo, useCallback } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import type { SlotTransactions } from "../../../api/types";
import UplotReact from "../../../uplotReact/UplotReact";
import type uPlot from "uplot";
import { getTxnIncome } from "../../../utils";
import {
  focusedBorderColor,
  nonDelinquentChartColor,
  successToggleColor,
} from "../../../colors";
import { Text } from "@radix-ui/themes";

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

const fills = [successToggleColor, focusedBorderColor, nonDelinquentChartColor];

interface CuIncomeScatterChartProps {
  slotTransactions: SlotTransactions;
}

export default function TxnIncomePctBarChart({
  slotTransactions,
}: CuIncomeScatterChartProps) {
  const slotTransactionsRef = useRef(slotTransactions);
  slotTransactionsRef.current = slotTransactions;

  const percentileData = useMemo(
    () => getIncomeChartData(slotTransactions),
    [slotTransactions],
  );

  const getOptions = useCallback(
    (data: Record<string, number>): uPlot.Options => {
      return {
        width: 500,
        height: 500,
        scales: {
          x: {
            time: false,
            range: [0, 100],
          },
          y: {
            range: [0, 1],
          },
        },
        axes: [
          {
            grid: { show: false },
            show: false,
          },
          {
            show: false,
          },
        ],
        series: [
          {},
          {
            show: false,
          },
        ],
        legend: { show: false },
        hooks: {
          draw: [
            (u) => {
              const { ctx, bbox } = u;
              const barPxHeight = 36; // thickness of the horizontal bar in pixels
              const yCenter = bbox.top + bbox.height / 2;
              const yTop = Math.round(yCenter - barPxHeight / 2);
              const yBottom = yTop + barPxHeight;

              // Clip to plotting area
              ctx.save();
              ctx.beginPath();
              ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
              ctx.clip();

              let curPos = 0;

              // Draw each chunk as a filled rect
              Object.entries(data).forEach(([label, pct], i) => {
                const x1 = u.valToPos(curPos, "x", true);
                const endPos = curPos + pct * 100;
                const x2 = u.valToPos(endPos, "x", true);
                curPos = endPos;
                const left = Math.min(x1, x2);
                const width = Math.abs(x2 - x1);

                ctx.fillStyle = fills[i];
                ctx.fillRect(left, yTop, width, barPxHeight);

                // Optional: draw a thin separator line between chunks
                ctx.fillStyle = "rgba(0,0,0,0.15)";
                ctx.fillRect(left, yTop, 1, barPxHeight);
              });

              // Optional: labels centered in each chunk (skip if too narrow)
              ctx.font =
                "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              curPos = 0;

              Object.entries(data).forEach(([label, pct], i) => {
                const x1 = u.valToPos(curPos, "x", true);
                const endPos = curPos + pct * 100;
                const x2 = u.valToPos(endPos, "x", true);
                curPos = endPos;
                const left = Math.min(x1, x2);
                const width = Math.abs(x2 - x1);

                if (width >= 24 && label) {
                  // // Choose white or black text based on background luminance (very rough)
                  // const col = ch.color.replace("#", "");
                  // const r = parseInt(col.substring(0, 2), 16);
                  // const g = parseInt(col.substring(2, 4), 16);
                  // const b = parseInt(col.substring(4, 6), 16);
                  // const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                  ctx.fillStyle = "#fff";
                  ctx.fillText(label, left + width / 2, (yTop + yBottom) / 2);
                }
              });

              ctx.restore();
            },
          ],
        },
      };
    },
    [],
  );

  const percentileOptions = useMemo<uPlot.Options>(
    () => getOptions(percentileData.disjoint),
    [getOptions, percentileData.disjoint],
  );

  const bundleOptions = useMemo<uPlot.Options>(() => {
    const data: Record<string, number> = {};

    const totals = slotTransactions.txn_from_bundle.reduce(
      (totals, isBundle, i) => {
        if (isBundle) {
          totals.bundle.count++;
          totals.bundle.total += getTxnIncome(slotTransactions, i);
        } else {
          totals.nonBundle.count++;
          totals.nonBundle.total += getTxnIncome(slotTransactions, i);
        }
        return totals;
      },
      { bundle: { total: 0n, count: 0 }, nonBundle: { total: 0n, count: 0 } },
    );

    const totalIncome = Number(totals.bundle.total + totals.nonBundle.total);
    const bundlePct = Number(totals.bundle.total) / totalIncome;
    const nonBundlePct = Number(totals.nonBundle.total) / totalIncome;
    data[`bundle ${Math.round(bundlePct * 100)}%`] = bundlePct;
    data[`non-bundle ${Math.round(nonBundlePct * 100)}%`] = nonBundlePct;
    return getOptions(data);
  }, [getOptions, slotTransactions]);

  const chartData = useMemo<uPlot.AlignedData>(() => {
    const x = [0, 100];
    const y = [0, 1];
    return [x, y];
  }, []);

  return (
    <>
      <Text style={{ color: "var(--gray-11)" }} size="1">
        (e.g. n% of income from the block came from 1% of txns)
      </Text>
      <div style={{ minHeight: "30px" }}>
        <AutoSizer>
          {({ height, width }) => {
            percentileOptions.width = width;
            percentileOptions.height = height;
            return (
              <>
                <UplotReact
                  id="cuIncome"
                  options={percentileOptions}
                  data={chartData}
                />
              </>
            );
          }}
        </AutoSizer>
      </div>
      <Text style={{ color: "var(--gray-11)", marginTop: "4px" }} size="1">
        (e.g. n% of income from the block came from bundles)
      </Text>
      <div style={{ minHeight: "30px" }}>
        <AutoSizer>
          {({ height, width }) => {
            bundleOptions.width = width;
            bundleOptions.height = height;
            return (
              <>
                <UplotReact
                  id="bundleIncome"
                  options={bundleOptions}
                  data={chartData}
                />
              </>
            );
          }}
        </AutoSizer>
      </div>
    </>
  );
}
