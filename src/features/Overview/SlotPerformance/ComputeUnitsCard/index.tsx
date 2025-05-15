import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom, tileCountAtom } from "../atoms";
import Card from "../../../../components/Card";
import CardHeader from "../../../../components/CardHeader";
import { Flex } from "@radix-ui/themes";
import styles from "./computeUnits.module.css";
import CuChart from "./CuChart";
import CuChartTooltip from "./CuChartTooltip";
import CuChartActions from "./CuChartActions";
import uPlot from "uplot";
import { useCallback, useRef } from "react";
import { defaultMaxComputeUnits } from "../../../../consts";

export default function ComputeUnitsCard() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);
  const uplotRef = useRef<uPlot>();

  const tileCount = useAtomValue(tileCountAtom);
  const bankTileCount = tileCount["bank"];

  const handleCreate = useCallback((u: uPlot) => {
    uplotRef.current = u;
  }, []);

  const onUplot = useCallback(
    (func: (u: uPlot) => void) => uplotRef.current && func(uplotRef.current),
    [],
  );

  if (!slot || !query.response?.transactions) return null;

  return (
    <>
      <Card style={{ marginTop: "8px" }}>
        <Flex direction="column" height="100%" gap="2">
          <Flex gap="3">
            <CardHeader text="Slot Progression" />
            <CuChartActions onUplot={onUplot} />
          </Flex>
          <div className={styles.chart}>
            <CuChart
              slotTransactions={query.response.transactions}
              maxComputeUnits={
                query.response.publish.max_compute_units ??
                defaultMaxComputeUnits
              }
              bankTileCount={bankTileCount}
              onCreate={handleCreate}
            />
          </div>
        </Flex>
      </Card>
      <CuChartTooltip />
    </>
  );
}
