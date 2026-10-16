import { Flex, Table } from "@radix-ui/themes";
import tableStyles from "../../../components/dataTable.module.css";
import type { Tile } from "../../../api/types";
import { memo, useRef } from "react";
import { useRowState, writeRow } from "./utils";
import { SelectTileToggle } from "./SelectTileToggle";
import { useTileSelect } from "./TileSelectContext";
import clsx from "clsx";

interface PinnedRowProps {
  tile: Tile;
  id: string;
  idx: number;
}

export const PinnedRow = memo(function PinnedRow({
  tile,
  id,
  idx,
}: PinnedRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useRowState(idx, rowRef, writeRow);
  const { onTileClick } = useTileSelect();

  return (
    <Table.Row
      id={id}
      ref={rowRef}
      className={clsx(tableStyles.dataRow, tableStyles.clickable)}
      onClick={() => onTileClick(tile)}
    >
      <Table.Cell className={tableStyles.rightBorder}>
        <Flex align="center" gap="8px">
          <SelectTileToggle />
          <span>
            {tile.kind}:{tile.kind_id}
          </span>
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
});
