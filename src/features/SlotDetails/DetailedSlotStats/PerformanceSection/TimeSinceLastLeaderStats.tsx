import { Flex, Table, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { Duration } from "luxon";
import { useMemo } from "react";
import { leaderSlotsAtom, slotDurationAtom } from "../../../../atoms";
import { getDurationText, getSlotGroupLeader } from "../../../../utils";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { slotsPerLeader } from "../../../../consts";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import byteSize from "byte-size";

export function TimeSinceLastLeaderStats() {
  const slotDuration = useAtomValue(slotDurationAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);

  const prevGroupSlot = useMemo(() => {
    if (selectedSlot === undefined || !leaderSlots) return;

    const slotGroupLeader = getSlotGroupLeader(selectedSlot);
    const leaderSlotsIdx = leaderSlots.indexOf(slotGroupLeader) - 1;
    if (leaderSlotsIdx < 0) return;

    // get the last slot of the previous group
    return leaderSlots[leaderSlotsIdx] + slotsPerLeader - 1;
  }, [leaderSlots, selectedSlot]);

  if (selectedSlot === undefined) return;

  const timeTill = prevGroupSlot
    ? Duration.fromMillis(
        slotDuration * (selectedSlot - prevGroupSlot),
      ).rescale()
    : undefined;

  return (
    <>
      <Flex direction="column" gap="1">
        <Text style={{ color: "var(--gray-12)" }}>Scheduler</Text>
        <Flex gap="2">
          <Text style={{ color: "var(--gray-10)" }}>
            Time Since Last Leader Group
          </Text>
          <Text style={{ color: "var(--gray-11)" }}>
            {getDurationText(timeTill)}
          </Text>
        </Flex>
      </Flex>
      <SchedulerStats />
    </>
  );
}

const scheduleOutcomes = [
  "success",
  "fail_taken",
  "fail_fast_path",
  "fail_byte_limit",
  "fail_write_cost",
  "fail_slow_path",
  "fail_defer_skip",
];

function SchedulerStats() {
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
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text>Txn Schedule Outcomes</Text>
        <Table.Root size="1" variant="ghost">
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
                <Table.Cell>
                  <Text style={{ color: "var(--gray-12)" }}>
                    {scheduleOutcomes[i]}
                  </Text>
                </Table.Cell>
                <Table.Cell align="right">
                  <Text style={{ color: "var(--gray-12)" }}>
                    {scheduleCount.toLocaleString()}
                  </Text>
                </Table.Cell>
                <Table.Cell align="right">
                  <Text style={{ color: "var(--gray-12)" }}>
                    {end_slot_schedule_counts[i].toLocaleString()}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Flex>

      <Flex direction="column" gap="1">
        <Text style={{ color: "var(--gray-12)" }}></Text>
        <Table.Root size="1" variant="ghost">
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
              <Table.Cell>
                <Text>Non-vote</Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text>{pending_smallest_cost?.toLocaleString() ?? 0}</Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text>
                  {pending_smallest_bytes != null
                    ? byteSize(pending_smallest_bytes)?.toString()
                    : 0}
                </Text>
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>
                <Text>Vote</Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text>{pending_vote_smallest_cost?.toLocaleString() ?? 0}</Text>
              </Table.Cell>
              <Table.Cell align="right">
                <Text>
                  {pending_vote_smallest_bytes != null
                    ? byteSize(pending_vote_smallest_bytes)?.toString()
                    : 0}
                </Text>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Flex>
    </Flex>
  );
}
