import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { feesColor, incomeColor, tipsColor } from "../../../colors.ts";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { TxnSlotRows } from "../Tooltip/rows.tsx";
import { formatSol } from "../Tooltip/utils.ts";
import {
  revenueSeries,
  revenueSeriesLabels,
  type RevenueSeries,
} from "./consts.ts";
import { hoveredRevenueTxnInfoAtom } from "./hoverAtoms.ts";

const revenueSeriesColors = Object.fromEntries(
  revenueSeries.map(({ value, color }) => [value, color]),
) as Record<RevenueSeries, string>;

/** The txn hovered on the revenue track */
export default function RevenueTxnTooltip() {
  const info = useAtomValue(hoveredRevenueTxnInfoAtom);
  if (!info) return null;

  const { slot, series, meta } = info;
  const feesLamports = meta.transactionFee + meta.priorityFee;

  return (
    <ReplayCursorTooltip>
      <TooltipHeader color={revenueSeriesColors[series]}>
        {revenueSeriesLabels[series]}
      </TooltipHeader>
      <RowSeparator />
      <TxnSlotRows
        slot={slot}
        startMs={meta.loadStartMs}
        execrpId={meta.execIdx}
      />
      <RowSeparator />
      <TooltipRow
        label="Income"
        value={formatSol(feesLamports + meta.tips)}
        unit="SOL"
        valueColor={incomeColor}
      />
      <TooltipRow
        label="Fees"
        value={formatSol(feesLamports)}
        unit="SOL"
        valueColor={feesColor}
      />
      <TooltipRow
        label="Tips"
        value={formatSol(meta.tips)}
        unit="SOL"
        valueColor={tipsColor}
      />
    </ReplayCursorTooltip>
  );
}
