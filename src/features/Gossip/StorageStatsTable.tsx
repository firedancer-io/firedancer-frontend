import { Flex, Table, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import EmaTableCell from "./RateTableCell";
import { storageTypes } from "./consts";
import type { GossipStorageStats } from "../../api/types";
import tableStyles from "./table.module.css";

interface StorageStatsTableProps {
  storage: GossipStorageStats;
}

export default function StorageStatsTable({ storage }: StorageStatsTableProps) {
  const data = useMemo(() => {
    if (!storage?.count) return;

    return storage.count
      .map((_, i) => {
        return {
          type: storageTypes[i],
          activeEntries: storage.count?.[i],
          egressCount: storage.count_tx?.[i],
          egressBytes: storage.bytes_tx?.[i],
        };
      })
      .sort((a, b) => b.activeEntries - a.activeEntries);
  }, [storage]);

  if (!data) return;

  return (
    <Flex
      direction="column"
      gap="1"
      style={{
        // takes table out of grid track sizing so it will size up to the other column's table
        contain: "size",
        // so it doesn't shrink to 0 when collapsed to single column
        minHeight: "250px",
      }}
    >
      <Text size="4">Storage Stats</Text>
      <Table.Root
        variant="surface"
        className={tableStyles.root}
        style={{ minHeight: 0 }}
        size="1"
      >
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Entry Type</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Total Entries
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Egress /s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Egress Throughput /s
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {data?.map((row) => {
            return (
              <Table.Row key={row.type}>
                <Table.RowHeaderCell>{row.type}</Table.RowHeaderCell>
                <Table.Cell align="right">
                  {row.activeEntries.toLocaleString()}
                </Table.Cell>
                <EmaTableCell value={row.egressCount ?? 0} />
                <EmaTableCell value={row.egressBytes ?? 0} inBytes />
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
