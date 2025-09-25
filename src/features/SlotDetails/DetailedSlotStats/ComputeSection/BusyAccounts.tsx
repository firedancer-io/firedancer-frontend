import { Grid, Text } from "@radix-ui/themes";
import styles from "./computeUnitStats.module.css";
import { useAtomValue } from "jotai";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import PctBarRow from "../PctBarRow";

export default function BusyAccounts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const publish = useSlotQueryPublish(selectedSlot).publish;

  if (!publish) return;

  return (
    <div>
      <Text style={{ color: "var(--gray-12)" }}>Top 5 Busy Accounts</Text>
      <Grid
        columns="repeat(5, auto) minmax(80px, 200px)"
        gapX="2"
        gapY="1"
        className={styles.statsGrid}
      >
        <PctBarRow
          label="DNVZMSqe...wo23eWkf"
          value={100_123_531}
          total={999_999_999}
          valueColor="#30A46C"
        />
        <PctBarRow
          label="DNVZMSqe...wo23eWkf"
          value={100_123_531}
          total={999_999_999}
          valueColor="#30A46C"
        />
        <PctBarRow
          label="DNVZMSqe...wo23eWkf"
          value={100_123_531}
          total={999_999_999}
          valueColor="#30A46C"
        />
        <PctBarRow
          label="DNVZMSqe...wo23eWkf"
          value={100_123_531}
          total={999_999_999}
          valueColor="#30A46C"
        />
        <PctBarRow
          label="DNVZMSqe...wo23eWkf"
          value={100_123_531}
          total={999_999_999}
          valueColor="#30A46C"
        />
      </Grid>
    </div>
  );
}
