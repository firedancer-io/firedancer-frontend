import { Flex, Table, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import EmaTableCell from "./RateTableCell";
import { headerGap, storageTypes, tableMinWidth } from "./consts";
import type { GossipStorageStats } from "../../api/types";
import styles from "./table.module.css";

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
      className={styles.storageStatsContainer}
      direction="column"
      gap={headerGap}
      minWidth={tableMinWidth}
      height="100%"
      // Prevents shrinking to 0 when collapsed to single column
      minHeight="250px"
    >
      <Text className={styles.headerText}>Storage Stats</Text>
      <Table.Root variant="surface" className={styles.root} size="1">
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
