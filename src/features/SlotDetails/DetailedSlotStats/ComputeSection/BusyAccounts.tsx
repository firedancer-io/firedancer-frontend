import { Grid } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import PctBarRow from "../PctBarRow";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { gridGapX, gridGapY } from "../consts";

export default function BusyAccounts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryResponse = useSlotQueryResponseDetailed(selectedSlot).response;
  if (!queryResponse) return;
  const { limits } = queryResponse;
  if (!limits) return;

  return (
    <SlotDetailsSubSection title="Top 5 Busy Accounts">
      <Grid
        columns="repeat(5, auto) minmax(80px, 100%)"
        gapX={gridGapX}
        gapY={gridGapY}
      >
        {limits.used_account_write_costs.map(({ account, cost }) => (
          <PctBarRow
            key={account}
            label={account}
            labelWidth="80px"
            value={cost}
            total={limits.max_account_write_cost}
            valueColor="#30A46C"
            numeratorColor={false}
            pctColor={true}
          />
        ))}
      </Grid>
    </SlotDetailsSubSection>
  );
}
