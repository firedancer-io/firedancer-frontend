import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import byteSize from "byte-size";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { gridGapX, gridGapY } from "../consts";
import styles from "../detailedSlotStats.module.css";
import { Fragment } from "react/jsx-runtime";

const scheduleOutcomes = [
  "success",
  "fail_taken",
  "fail_fast_path",
  "fail_byte_limit",
  "fail_write_cost",
  "fail_slow_path",
  "fail_defer_skip",
];

export default function SchedulerStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const schedulerStats =
    useSlotQueryResponseDetailed(selectedSlot).response?.scheduler_stats;
  if (!schedulerStats) return;

  const {
    slot_schedule_counts,
    end_slot_schedule_counts,
    pending_smallest_bytes,
    pending_smallest_cost,
    pending_vote_smallest_bytes,
    pending_vote_smallest_cost,
  } = schedulerStats;

  return (
    <>
      <SlotDetailsSubSection title="Txn Schedule Outcomes">
        <Grid columns="repeat(3, 1fr)" gapX={gridGapX} gapY={gridGapY}>
          <Text className={styles.label}>Outcome</Text>
          <Text className={styles.tableHeader} align="right">
            Txn Count
          </Text>
          <Text className={styles.tableHeader} align="right">
            Txn Count (End)
          </Text>

          {slot_schedule_counts.map((scheduleCount, i) => {
            const label = scheduleOutcomes[i];
            return (
              <Fragment key={label}>
                <Text className={styles.label}>{label}</Text>
                <Text className={styles.value} align="right">
                  {scheduleCount.toLocaleString()}
                </Text>
                <Text className={styles.value} align="right">
                  {end_slot_schedule_counts[i].toLocaleString()}
                </Text>
              </Fragment>
            );
          })}
        </Grid>
      </SlotDetailsSubSection>
      <SlotDetailsSubSection title="Smallest Pending Txn">
        <Grid columns="repeat(3, 1fr)" gapX={gridGapX} gapY={gridGapY}>
          <div />
          <Text className={styles.tableHeader} align="right">
            CU Cost
          </Text>
          <Text className={styles.tableHeader} align="right">
            Size
          </Text>

          <Text className={styles.label}>Non-vote</Text>
          <Text className={styles.value} align="right">
            {pending_smallest_cost?.toLocaleString() ?? 0}
          </Text>
          <Text className={styles.value} align="right">
            {pending_smallest_bytes != null
              ? byteSize(pending_smallest_bytes)?.toString()
              : 0}
          </Text>

          <Text className={styles.label}>Vote</Text>
          <Text className={styles.value} align="right">
            {pending_vote_smallest_cost?.toLocaleString() ?? 0}
          </Text>
          <Text className={styles.value} align="right">
            {pending_vote_smallest_bytes != null
              ? byteSize(pending_vote_smallest_bytes)?.toString()
              : 0}
          </Text>
        </Grid>
      </SlotDetailsSubSection>
    </>
  );
}
