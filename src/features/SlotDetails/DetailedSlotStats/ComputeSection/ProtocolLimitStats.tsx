import { Grid, Text } from "@radix-ui/themes";
import styles from "./computeUnitStats.module.css";
import { useAtomValue } from "jotai";
import { computeUnitsColor } from "../../../../colors";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import PctBarRow from "../PctBarRow";

export default function ProtocolLimitStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const publish = useSlotQueryPublish(selectedSlot).publish;

  if (!publish) return;

  return (
    <div>
      <Text style={{ color: "var(--gray-12)" }}>
        Protocol Limit Utilization
      </Text>
      <Grid
        columns="repeat(5, auto) minmax(80px, 250px)"
        gapX="2"
        gapY="1"
        className={styles.statsGrid}
      >
        <PctBarRow
          label="Block cost"
          value={publish.compute_units ?? 0}
          total={publish.max_compute_units ?? 0}
          valueColor={computeUnitsColor}
        />
        <PctBarRow
          label="Vote cost"
          value={732_000_000}
          total={999_999_999}
          valueColor={"#30A46C"}
        />
      </Grid>
    </div>
  );
}
