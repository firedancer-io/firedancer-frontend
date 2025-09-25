import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../../Overview/SlotPerformance/atoms";
import CuIncomeScatterChart from "./CuIncomeScatterChart";
import { Flex, Text } from "@radix-ui/themes";
import ArrivalIncomeScatterChart from "./ArrivalIncomeScatterChart.tsx";

export default function IncomeScatterCharts() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(slot);

  if (!query.response?.transactions) return null;

  return (
    <Flex flexGrow="1">
      <Flex
        direction="column"
        // flexGrow="1"
        style={{
          // width: "100%",
          // height: "100%",
          minHeight: "100px",
          minWidth: "100px",
          flex: 1,
        }}
      >
        <Text>CUs Consumed vs Income</Text>
        <CuIncomeScatterChart slotTransactions={query.response.transactions} />
      </Flex>
      <Flex
        direction="column"
        // flexGrow="1"
        style={{
          // width: "100%",
          // height: "100%",
          minHeight: "100px",
          minWidth: "100px",
          flex: 1,
        }}
      >
        <Text>Arrival Time vs Income</Text>
        <ArrivalIncomeScatterChart slotTransactions={query.response.transactions} />
      </Flex>
    </Flex>
  );
}
