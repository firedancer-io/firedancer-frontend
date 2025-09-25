import { Grid, Text } from "@radix-ui/themes";
import styles from "./computeUnitStats.module.css";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import PctBarRow from "../PctBarRow";

export default function BusyAccounts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryResponse = useSlotQueryResponseDetailed(selectedSlot).response;
  if (!queryResponse) return;
  const { limits } = queryResponse;
  if (!limits) return;

  return (
    <div>
      <Text style={{ color: "var(--gray-12)" }}>Top 5 Busy Accounts</Text>
      <Grid
        columns="repeat(5, auto) minmax(80px, 200px)"
        gapX="2"
        gapY="1"
        className={styles.statsGrid}
      >
        {limits.used_account_write_costs.map(({ account, cost }) => (
          <PctBarRow
            key={account}
            label={`${account.substring(0, 8)}...`}
            value={cost}
            total={limits.max_account_write_cost}
            valueColor="#30A46C"
          />
        ))}
      </Grid>
    </div>
  );
}
