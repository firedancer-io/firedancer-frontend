import styles from "./scheduleOutcomes.module.css";
import { Flex, Table } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import byteSize from "byte-size";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";

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
    <SlotDetailsSubSection
      title="Txn Schedule Outcomes"
      className={styles.tableContainer}
    >
      <Flex direction="column" gap="3">
        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Outcome</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                Txn Count
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                Txn Count (end)
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {slot_schedule_counts.map((scheduleCount, i) => (
              <Table.Row key={i}>
                <Table.RowHeaderCell>{scheduleOutcomes[i]}</Table.RowHeaderCell>
                <Table.Cell align="right">
                  {scheduleCount.toLocaleString()}
                </Table.Cell>
                <Table.Cell align="right">
                  {end_slot_schedule_counts[i].toLocaleString()}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>

        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>
                Smallest pending txn
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                Cu Cost
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                Size
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.RowHeaderCell>Non-vote</Table.RowHeaderCell>
              <Table.Cell align="right">
                {pending_smallest_cost?.toLocaleString() ?? 0}
              </Table.Cell>
              <Table.Cell align="right">
                {pending_smallest_bytes != null
                  ? byteSize(pending_smallest_bytes)?.toString()
                  : 0}
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.RowHeaderCell>Vote</Table.RowHeaderCell>
              <Table.Cell align="right">
                {pending_vote_smallest_cost?.toLocaleString() ?? 0}
              </Table.Cell>
              <Table.Cell align="right">
                {pending_vote_smallest_bytes != null
                  ? byteSize(pending_vote_smallest_bytes)?.toString()
                  : 0}
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Flex>
    </SlotDetailsSubSection>
  );
}
