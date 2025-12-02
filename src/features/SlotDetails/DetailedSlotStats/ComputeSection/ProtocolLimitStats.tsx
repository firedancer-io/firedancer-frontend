import { Grid } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { computeUnitsColor, votesColor } from "../../../../colors";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import PctBarRow from "../PctBarRow";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { gridGapX, gridGapY } from "../consts";

export default function ProtocolLimitStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryResponse = useSlotQueryResponseDetailed(selectedSlot).response;
  if (!queryResponse) return;
  const { limits } = queryResponse;
  if (!limits) return;

  return (
    <SlotDetailsSubSection title="Protocol Limit Utilization">
      <Grid
        columns="repeat(5, auto) minmax(80px, 100%)"
        gapX={gridGapX}
        gapY={gridGapY}
      >
        <PctBarRow
          label="Block cost"
          value={limits.used_total_block_cost ?? 0}
          total={limits.max_total_block_cost ?? 0}
          valueColor={computeUnitsColor}
        />
        <PctBarRow
          label="Vote cost"
          value={limits.used_total_vote_cost ?? 0}
          total={limits.max_total_vote_cost ?? 0}
          valueColor={votesColor}
        />
        <PctBarRow
          label="Bytes"
          value={limits.used_total_bytes ?? 0}
          total={limits.max_total_bytes ?? 0}
          valueColor="#A35829"
        />
        <PctBarRow
          label="Microblocks"
          value={limits.used_total_microblocks ?? 0}
          total={limits.max_total_microblocks ?? 0}
          valueColor="#9EB1FF"
        />
      </Grid>
    </SlotDetailsSubSection>
  );
}
