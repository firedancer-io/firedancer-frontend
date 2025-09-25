import { Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  tipsColor,
  feesColor,
  incomePerCuToggleControlColor,
} from "../../../../colors";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { getPaidTxnFees, getPaidTxnTips } from "../../../../utils";
import { formatNumberLamports } from "../../../Overview/ValidatorsCard/formatAmt";
import { solDecimals } from "../../../../consts";

export const defaultMaxValue = 100_000_000n;

export default function RewardStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);

  const stats = useMemo(() => {
    const transactions = query?.response?.transactions;
    if (!transactions) return;

    const { tips, fees } = transactions.txn_transaction_fee.reduce(
      (acc, _, i) => {
        acc.fees += getPaidTxnFees(transactions, i);
        acc.tips += getPaidTxnTips(transactions, i);

        return acc;
      },
      {
        tips: 0n,
        fees: 0n,
      },
    );

    const total = tips + fees;

    return {
      tips: tips,
      fees: fees,
      total: total,
      maxValue: total > defaultMaxValue ? total : defaultMaxValue,
    };
  }, [query]);

  if (!stats) return;

  const { tips, fees, total, maxValue } = stats;

  return (
    <>
      <Text style={{ color: "var(--gray-12)", gridColumn: "span 3" }}>
        Earnings
      </Text>
      <Row label="Tips" value={tips} total={maxValue} color={tipsColor} />
      <Row label="Fees" value={fees} total={maxValue} color={feesColor} />
      <Row
        label="Total Income"
        value={total}
        total={maxValue}
        color={incomePerCuToggleControlColor}
      />
    </>
  );
}

interface RowProps {
  label: string;
  value: bigint;
  total: bigint;
  color: string;
}

function Row({ label, value, total, color }: RowProps) {
  const valuePct = total > 0n ? (Number(value) / Number(total)) * 100 : 0;

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color }} align="right">
        {`${formatNumberLamports(value ?? 0n, solDecimals, {
          decimals: solDecimals,
          trailingZeroes: true,
        })} SOL`}
      </Text>
      <svg
        height="8"
        width="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center" }}
      >
        <rect height="8" width={`${valuePct}%`} opacity={0.6} fill={color} />
      </svg>
    </>
  );
}
