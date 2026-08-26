import { useMemo, useState } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMeasure, useWindowSize } from "react-use";
import clamp from "lodash/clamp";
import { selectedSlotAtom, tileCountAtom } from "../atoms";
import ChartControls from "./ChartControls";
import { Flex } from "@radix-ui/themes";
import BarsChart from "./BarsChart";
import {
  barChartAxisSize,
  barChartMaxHeight,
  barChartMinRowHeight,
} from "./consts";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { baseChartDataAtom, barCountAtom, selectedBankAtom } from "./atoms";
import { getChartData } from "./chartUtils";
import BarChartFloatingAction from "./BarChartFloatingAction";
import CardHeader from "../../../../components/CardHeader";
import { getMaxTs } from "../../../../transactionUtils";
import { cardBackgroundColor } from "../../../../colors";
import {
  clusterIndicatorHeight,
  headerHeight,
  slotNavHeight,
} from "../../../../consts";
import useChartControl from "./ChartControls/useChartControl";
import { FOCUS_BANK_KEY } from "../../../SlotDetails/ChartControlsContext";
import { tileNames } from "../../../../utils";

const navigationTop = clusterIndicatorHeight + headerHeight;
export const txnBarsControlsStickyTop = navigationTop + slotNavHeight;

export default function BarsChartContainer() {
  const [focusedBankIdx, setFocusedBankIdx] = useState<number>();

  useChartControl(
    FOCUS_BANK_KEY,
    (bankIdx) => setFocusedBankIdx(bankIdx),
    () => setFocusedBankIdx(undefined),
  );

  const slot = useAtomValue(selectedSlotAtom);

  const query = useSlotQueryResponseTransactions(slot);
  const transactions = query.response?.transactions;

  const tileCount = useAtomValue(tileCountAtom);
  const bankTileCount = tileCount[tileNames.bank];

  const setBaseChartDataAtom = useSetAtom(baseChartDataAtom);

  const maxTs = useMemo(() => {
    if (!transactions) return 0;

    return getMaxTs(transactions, true);
  }, [transactions]);

  useMemo(() => {
    if (!transactions) return;
    const chartData: uPlot.AlignedData[] = [];
    for (let i = 0; i < bankTileCount; i++) {
      chartData.push(getChartData(transactions, i, maxTs));
    }
    setBaseChartDataAtom(chartData);
  }, [bankTileCount, maxTs, transactions, setBaseChartDataAtom]);

  const [selected, setSelected] = useAtom(selectedBankAtom);

  const { height: windowHeight } = useWindowSize();
  const [controlsRef, { height: controlsHeight }] =
    useMeasure<HTMLDivElement>();

  const barCount = useAtomValue(barCountAtom);

  const rowHeight = useMemo(() => {
    const rows = Math.max(1, barCount);
    const visibleBankCount =
      selected !== undefined ? 1 : Math.max(1, bankTileCount);
    const availableForCharts =
      windowHeight -
      txnBarsControlsStickyTop -
      controlsHeight -
      barChartAxisSize * Math.min(visibleBankCount, 2);
    const maxRowHeight = Math.max(
      barChartMaxHeight / rows,
      barChartMinRowHeight,
    );
    return clamp(
      availableForCharts / (visibleBankCount * rows),
      barChartMinRowHeight,
      maxRowHeight,
    );
  }, [windowHeight, controlsHeight, bankTileCount, barCount, selected]);

  if (!transactions) return null;

  return (
    <Flex direction="column" height="100%">
      <Flex
        ref={controlsRef}
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
        <ChartControls transactions={transactions} maxTs={maxTs} />
      </Flex>
      {new Array(bankTileCount).fill(0).map((_, bankIdx) => {
        const isSelected = selected === bankIdx;
        if (selected !== undefined && !isSelected) return;

        const hasTopAxis = bankIdx === 0 || isSelected;
        const hasAxis = hasTopAxis || bankIdx === bankTileCount - 1;

        return (
          <div key={bankIdx} style={{ position: "relative" }}>
            {(selected === undefined || isSelected) && (
              <BarChartFloatingAction
                bankIdx={bankIdx}
                setSelected={() =>
                  setSelected((prev) =>
                    prev === undefined ? bankIdx : undefined,
                  )
                }
                isSelected={isSelected}
                hasTopAxis={hasTopAxis}
              />
            )}
            <BarsChart
              key={`${bankIdx}`}
              bankIdx={bankIdx}
              transactions={transactions}
              maxTs={maxTs}
              hasAxis={hasAxis}
              hasTopAxis={hasTopAxis}
              isFocused={focusedBankIdx === bankIdx}
              rowHeight={rowHeight}
            />
          </div>
        );
      })}
    </Flex>
  );
}
