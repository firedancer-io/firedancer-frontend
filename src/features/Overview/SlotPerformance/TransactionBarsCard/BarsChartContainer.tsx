import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedSlotAtom, tileCountAtom } from "../atoms";
import ChartControls from "./ChartControls";
import { Flex } from "@radix-ui/themes";
import BarsChart from "./BarsChart";
import { baseChartDataAtom, selectedBankAtom } from "./atoms";
import { getChartData } from "./chartUtils";
import BarChartFloatingAction from "./BarChartFloatingAction";
import CardHeader from "../../../../components/CardHeader";
import { cardBackgroundColor } from "../../../../colors";
import {
  clusterIndicatorHeight,
  headerHeight,
  slotNavHeight,
} from "../../../../consts";
import { ChartControlsContext } from "../../../SlotDetails/ChartControlsContext";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import type { SlotTransactions } from "../../../../api/types";
import { getMaxTsWithBuffer } from "../../../../transactionUtils";

const navigationTop = clusterIndicatorHeight + headerHeight;
export const txnBarsControlsStickyTop = navigationTop + slotNavHeight;

export default function BarsChartContainer() {
  const [focusedBankIdx, setFocusedBankIdx] = useState<number>();

  const { registerChart } = useContext(ChartControlsContext);

  useEffect(() => {
    const cleanup = registerChart((bankIdx?: number) =>
      setFocusedBankIdx(bankIdx),
    );
    return cleanup;
  }, [registerChart]);

  const slot = useAtomValue(selectedSlotAtom);

  const query = useSlotQueryResponseTransactions(slot);
  const queryTxsRef = useRef<SlotTransactions | null | undefined>(
    query.response?.transactions,
  );
  queryTxsRef.current = query.response?.transactions;

  const tileCount = useAtomValue(tileCountAtom);
  const bankTileCount = tileCount["execle"];

  const setBaseChartDataAtom = useSetAtom(baseChartDataAtom);

  const maxTs = useMemo(() => {
    if (!query.response?.transactions) return 0;

    return getMaxTsWithBuffer(query.response.transactions);
  }, [query.response?.transactions]);

  useMemo(() => {
    if (!query.response?.transactions) return;
    const chartData: uPlot.AlignedData[] = [];
    for (let i = 0; i < bankTileCount; i++) {
      chartData.push(getChartData(query.response.transactions, i, maxTs));
    }
    setBaseChartDataAtom(chartData);
  }, [
    bankTileCount,
    maxTs,
    query.response?.transactions,
    setBaseChartDataAtom,
  ]);

  const [selected, setSelected] = useAtom(selectedBankAtom);

  if (!query.response?.transactions) return null;

  return (
    <Flex direction="column" height="100%">
      <Flex
        id="transaction-bars-controls"
        gap="2"
        position="sticky"
        top={`${txnBarsControlsStickyTop}px`}
        style={{
          // For solid background when sticky scrolling matching the card's background
          background: cardBackgroundColor,
          // To draw above txn bars and tooltip
          zIndex: 4,
          paddingBottom: "16px",
          marginBottom: "-8px",
        }}
      >
        <CardHeader text="Banks" />
        <ChartControls
          transactions={query.response.transactions}
          maxTs={maxTs}
        />
      </Flex>
      {new Array(bankTileCount).fill(0).map((_, bankIdx) => {
        if (!query.response?.transactions) return;
        if (selected !== undefined && selected !== bankIdx) return;

        return (
          <div key={bankIdx} style={{ position: "relative" }}>
            {(selected === undefined || selected === bankIdx) && (
              <BarChartFloatingAction
                bankIdx={bankIdx}
                setSelected={() =>
                  setSelected((prev) =>
                    prev === undefined ? bankIdx : undefined,
                  )
                }
                isSelected={selected === bankIdx}
              />
            )}
            <BarsChart
              key={`${bankIdx}`}
              bankIdx={bankIdx}
              transactions={query.response.transactions}
              maxTs={maxTs}
              isFirstChart={bankIdx === 0 && bankTileCount > 1}
              isLastChart={
                bankIdx === bankTileCount - 1 || selected !== undefined
              }
              isSelected={selected === bankIdx}
              hide={selected !== undefined && selected !== bankIdx}
              isFocused={focusedBankIdx === bankIdx}
            />
          </div>
        );
      })}
    </Flex>
  );
}
