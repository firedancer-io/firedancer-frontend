import { useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedSlotAtom, tileCountAtom } from "../atoms";
import { SlotTransactions } from "../../../../api/types";
import ChartControls from "./ChartControls";
import { Flex } from "@radix-ui/themes";
import BarsChart from "./BarsChart";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { baseChartDataAtom, selectedBankAtom } from "./atoms";
import { getChartData } from "./chartUtils";
import BarChartFloatingAction from "./BarChartFloatingAction";
import CardHeader from "../../../../components/CardHeader";
import { getMaxTsWithBuffer } from "../../../../transactionUtils";

export default function BarsChartContainer() {
  const slot = useAtomValue(selectedSlotAtom);

  const query = useSlotQueryResponseTransactions(slot);
  const queryTxsRef = useRef<SlotTransactions | null | undefined>(
    query.response?.transactions,
  );
  queryTxsRef.current = query.response?.transactions;

  const tileCount = useAtomValue(tileCountAtom);
  const bankTileCount = tileCount["bank"];

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
    <Flex direction="column" height="100%" key={slot}>
      <Flex gap="2" pb="2">
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
            />
          </div>
        );
      })}
    </Flex>
  );
}
