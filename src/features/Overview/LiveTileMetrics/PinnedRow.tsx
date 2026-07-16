import { Table } from "@radix-ui/themes";
import tableStyles from "../../../components/dataTable.module.css";
import type { Tile } from "../../../api/types";
import { memo, useRef } from "react";
import { useRowState, writeRow } from "./utils";

interface PinnedRowProps {
  tile: Tile;
  idx: number;
}

export const PinnedRow = memo(function PinnedRow({
  tile,
  idx,
}: PinnedRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useRowState(idx, rowRef, writeRow);

  return (
    <Table.Row ref={rowRef} className={tableStyles.dataRow}>
      <Table.Cell className={tableStyles.rightBorder}>
        {tile.kind}:{tile.kind_id}
      </Table.Cell>
    </Table.Row>
  );
});
