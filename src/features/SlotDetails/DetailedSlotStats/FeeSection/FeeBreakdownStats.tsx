import { Flex, Grid, Text } from "@radix-ui/themes";
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

export const defaultMaxValue = 100_000_000;

export default function FeeBreakdownStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);

  const stats = useMemo(() => {
    const transactions = query?.response?.transactions;
    if (!transactions) return;

    const { tips, fees } = transactions.txn_transaction_fee.reduce(
      (acc, _, i) => {
        acc.fees += Number(getPaidTxnFees(transactions, i));
        acc.tips += Number(getPaidTxnTips(transactions, i));

        return acc;
      },
      {
        tips: 0,
        fees: 0,
      },
    );

    const income = tips + fees;
    const jito = tips * 0.06;

    return {
      tips,
      fees,
      jito,
      income,
      maxValue: income > defaultMaxValue ? income + jito : defaultMaxValue,
    };
  }, [query]);

  if (!stats) return;

  const { tips, fees, income, jito, maxValue } = stats;

  return (
    <div>
      <Text style={{ color: "var(--gray-12)" }}>Fee Breakdown</Text>
      <Grid columns="repeat(3, auto)" gapX="2" gapY="1">
        <TipsRow
          label="Tips"
          value={tips}
          total={maxValue}
          color={tipsColor}
          // startValue={jito}
        />
        <Row
          label="Fees"
          value={fees}
          total={maxValue}
          color={feesColor}
          // startValue={jito}
        />
        <TotalIncomeRow tips={tips} fees={fees} />
        {/* <Row
          label="Income"
          value={income}
          total={maxValue}
          color={incomePerCuToggleControlColor}
          // startValue={jito}
        /> */}
        {/* <Row label="Jito Comission" value={jito} total={maxValue} color={"#FFC53D"} /> */}
      </Grid>
    </div>
  );
}

interface TipsRowProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function TipsRow({ label, value, total, color }: TipsRowProps) {
  const valuePct = total > 0 ? (value / total) * 100 : 0;
  const commission = value * 0.06;
  const commissionPct = total > 0 ? (commission / total) * 100 : 0;

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
      <Flex>
        <svg
          height="8"
          width={`${valuePct + commissionPct}%`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ alignSelf: "center" }}
        >
          <rect
            height="8"
            width={`${(100 / 106) * 100}%`}
            opacity={0.6}
            fill={color}
          />
          <rect
            height="8"
            x={`${(100 / 106) * 100}%`}
            width={`${(6 / 106) * 100}%`}
            opacity={0.6}
            fill="#FFC53D"
            // strokeWidth="3"
            // strokeDasharray="0 2"
            // fill="blue"
          />
        </svg>
        <Text
          wrap="nowrap"
          style={{ color: "var(--gray-11)", marginLeft: "4px" }}
        >
          Commission&nbsp;
        </Text>
        <Text wrap="nowrap" style={{ color: "#FFC53D" }}>
          -
          {`${formatNumberLamports(commission ?? 0n, solDecimals, {
            decimals: solDecimals,
            trailingZeroes: true,
          })} SOL`}
        </Text>
      </Flex>
    </>
  );
}

interface RowProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function Row({ label, value, total, color }: RowProps) {
  const valuePct = total > 0 ? (value / total) * 100 : 0;

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

interface TotalIncomeRowProps {
  tips: number;
  fees: number;
}

function TotalIncomeRow({ tips, fees }: TotalIncomeRowProps) {
  const total = tips + fees;
  const max = Math.max(defaultMaxValue, total);
  const totalPct = (total / max) * 100;
  const tipPct = (tips / max) * 100;
  const feePct = (fees / max) * 100;

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        Income
      </Text>
      <Text
        wrap="nowrap"
        style={{ color: incomePerCuToggleControlColor }}
        align="right"
      >
        {`${formatNumberLamports(total, solDecimals, {
          decimals: solDecimals,
          trailingZeroes: true,
        })} SOL`}
      </Text>
      <svg
        height="10"
        width="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center" }}
      >
        <rect
          height="100%"
          width={`${tipPct}%`}
          opacity={0.6}
          fill={tipsColor}
          // x={`${startValuePct}%`}
        />
        <rect
          height="100%"
          x={`${tipPct}%`}
          width={`${feePct}%`}
          opacity={0.6}
          fill={feesColor}
          // x={`${startValuePct}%`}
        />
        <rect
          height="100%"
          x={`${tipPct}%`}
          width={1}
          opacity={0.6}
          fill={"black"}
          // x={`${startValuePct}%`}
        />
        {/* <rect
          height="8"
          width={`${totalPct}%`}
          x={.5}
          y={1}
          opacity={0.6}
          
          // x={`${startValuePct}%`}
          /> */}
        <rect
          height="9"
          width={`${totalPct}%`}
          x={0.5}
          y={0.5}
          opacity={1}
          stroke={incomePerCuToggleControlColor}
          strokeWidth={1}
          // x={`${startValuePct}%`}
        />
      </svg>
    </>
  );
}
