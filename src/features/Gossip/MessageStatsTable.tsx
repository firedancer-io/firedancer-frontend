import { Flex, Table, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import EmaTableCell from "./RateTableCell";
import type { GossipMessageStats } from "../../api/types";
import { messageTypes } from "./consts";
import tableStyles from "./table.module.css";

interface MessageStatsTableProps {
  messages: GossipMessageStats;
}

export default function MessageStatsTable({
  messages,
}: MessageStatsTableProps) {
  const tableData = useMemo(() => {
    return messages.num_bytes_rx.map((_, i) => {
      return {
        type: messageTypes[i],
        ingressBytes: messages.num_bytes_rx?.[i],
        egressBytes: messages.num_bytes_tx?.[i],
        ingressMessages: messages.num_messages_rx?.[i],
        egressMessages: messages.num_messages_tx?.[i],
      };
    });
  }, [messages]);

  if (!tableData) return;

  return (
    <Flex direction="column" gap="1">
      <Text size="4">Message Stats</Text>
      <Table.Root variant="surface" className={tableStyles.root} size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Message Type</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Ingress /s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Egress /s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Ingress Throughput /s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Egress Throughput /s
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {tableData?.map((row, i) => {
            return (
              <Table.Row key={row.type}>
                <Table.RowHeaderCell>{row.type}</Table.RowHeaderCell>
                <EmaTableCell value={row.ingressMessages ?? 0} />
                <EmaTableCell value={row.egressMessages ?? 0} />
                <EmaTableCell value={row.ingressBytes ?? 0} inBytes />
                <EmaTableCell value={row.egressBytes ?? 0} inBytes />
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
