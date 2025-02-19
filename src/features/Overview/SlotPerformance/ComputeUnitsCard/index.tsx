import { useAtomValue } from "jotai";
import useSlotQuery from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom, tileCountAtom } from "../atoms";
import Card from "../../../../components/Card";
import CardHeader from "../../../../components/CardHeader";
import Chart from "./Chart";
import { Flex } from "@radix-ui/themes";
import styles from "./computeUnits.module.css";
import Legend from "./Legend";

export default function ComputeUnitsCard() {
  const slot = useAtomValue(selectedSlotAtom);
  const query = useSlotQuery(slot, { requiresComputeUnits: true });

  const tileCount = useAtomValue(tileCountAtom);

  if (!slot || !query.slotResponse?.compute_units) return null;

  return (
    <Card style={{ marginTop: "8px" }}>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="CU Progression" />
        <div className={styles.chart}>
          <Chart
            computeUnits={query.slotResponse.compute_units}
            bankTileCount={tileCount["bank"]}
          />
          <Legend />
        </div>
      </Flex>
    </Card>
  );
}
