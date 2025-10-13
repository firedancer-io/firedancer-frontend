import { Table, Text } from "@radix-ui/themes";
import { gossipNetworkStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import RateTableCell from "./RateTableCell";

const messageTypes = [
  "pull_request",
  "pull_response",
  "push",
  "ping",
  "pong",
  "prune",
];

export default function MessagesTable() {
  const messages = useAtomValue(gossipNetworkStatsAtom)?.messages;
  const data = useMemo(() => {
    if (!messages?.num_bytes_rx) return;

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

  if (!data) return;

  return (
    <div style={{ minWidth: "500px" }}>
      <Text>Messages</Text>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Ingress</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Egress</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>PPS in</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>PPS out</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {data?.map((row, i) => {
            return (
              <Table.Row key={row.type}>
                <Table.RowHeaderCell>{row.type}</Table.RowHeaderCell>
                <RateTableCell value={row.ingressBytes ?? 0} inBytes />
                <RateTableCell value={row.egressBytes ?? 0} inBytes />
                <RateTableCell value={row.ingressMessages ?? 0} />
                <RateTableCell value={row.egressMessages ?? 0} />
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </div>
  );
}
