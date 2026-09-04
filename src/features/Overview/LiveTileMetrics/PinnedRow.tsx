import { Table } from "@radix-ui/themes";
import tableStyles from "../../../components/dataTable.module.css";
import type { Tile } from "../../../api/types";
import { memo, useRef } from "react";
import { useRowState, writeRow } from "./utils";
import type { SelectTileProps } from "./useTileSelect";
import clsx from "clsx";

interface PinnedRowProps {
  tile: Tile;
  idx: number;
  selectTileProps: SelectTileProps;
}

export const PinnedRow = memo(function PinnedRow({
  tile,
  idx,
  selectTileProps,
}: PinnedRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useRowState(idx, rowRef, writeRow);

  return (
    <Table.Row
      ref={rowRef}
      className={clsx(tableStyles.dataRow, tableStyles.selectable)}
      {...selectTileProps}
    >
      <Table.Cell className={tableStyles.rightBorder}>
        {tile.kind}:{tile.kind_id}
      </Table.Cell>
    </Table.Row>
  );
});
