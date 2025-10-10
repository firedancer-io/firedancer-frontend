import { Flex, Table, Text } from "@radix-ui/themes";
import { gossipNetworkStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import RateTableCell from "./RateTableCell";

const storageTypes = [
  "ContactInfoV1",
  "Vote",
  "LowestSlot",
  "SnapshotHashes",
  "AccountsHashes",
  "EpochSlots",
  "VersionV1",
  "VersionV2",
  "NodeInstance",
  "DuplicateShred",
  "IncrementalSnapshotHashes",
  "ContactInfoV2",
  "RestartLastVotedForkSlots",
  "RestartHeaviestFork",
];

export default function StorageTable() {
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const storage = networkStats?.storage;

  const data = useMemo(() => {
    if (!storage?.count) return;

    return storage.count.map((_, i) => {
      return {
        type: storageTypes[i],
        activeEntries: storage.count?.[i],
        egressCount: storage.count_tx?.[i],
        egressBytes: storage.bytes_tx?.[i],
      };
    });
  }, [storage]);

  if (!data) return;

  return (
    <div>
      <Text>Storage Stats</Text>
      <Flex gap="2">
        <Text>Evicted: {storage?.evicted_count?.toLocaleString()}</Text>
        <Text>Expired: {storage?.expired_count?.toLocaleString()}</Text>
        <Text>Capacity: {storage?.capacity?.toLocaleString()}</Text>
      </Flex>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Active Entries</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Egress Entries</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Egress Bytes</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {data?.map((row) => {
            return (
              <Table.Row key={row.type}>
                <Table.RowHeaderCell>{row.type}</Table.RowHeaderCell>
                <Table.Cell>{row.activeEntries}</Table.Cell>
                <RateTableCell value={row.egressCount ?? 0} />
                <RateTableCell value={row.egressBytes ?? 0} inBytes />
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </div>
  );
}
