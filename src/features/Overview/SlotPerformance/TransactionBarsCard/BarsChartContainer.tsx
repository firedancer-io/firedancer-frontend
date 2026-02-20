import { useContext, useEffect, useMemo, useState } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { tileCountAtom } from "../atoms";
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

const navigationTop = clusterIndicatorHeight + headerHeight;
export const txnBarsControlsStickyTop = navigationTop + slotNavHeight;

export default function BarsChartContainer() {
  const [focusedBankIdx, setFocusedBankIdx] = useState<number>();

  const { hasData, transactions, maxTs, registerChart } =
    useContext(ChartControlsContext);

  useEffect(() => {
    registerChart((bankIdx?: number) => setFocusedBankIdx(bankIdx));
  }, [registerChart]);

  const tileCount = useAtomValue(tileCountAtom);
  const bankTileCount = tileCount["execle"];

  const setBaseChartDataAtom = useSetAtom(baseChartDataAtom);

  useMemo(() => {
    if (!hasData) return;
    const chartData: uPlot.AlignedData[] = [];
    for (let i = 0; i < bankTileCount; i++) {
      chartData.push(getChartData(transactions, i, maxTs));
    }
    setBaseChartDataAtom(chartData);
  }, [hasData, setBaseChartDataAtom, bankTileCount, transactions, maxTs]);

  const [selected, setSelected] = useAtom(selectedBankAtom);

  if (!hasData) return null;

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
        <ChartControls />
      </Flex>
      {new Array(bankTileCount).fill(0).map((_, bankIdx) => {
        if (!hasData) return;
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
