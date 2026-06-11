import { Flex, Table } from "@radix-ui/themes";
import clsx from "clsx";

import styles from "./dataTable.module.css";
import { useMemo, type CSSProperties } from "react";

export interface ColumnDefinition {
  uniqueName: string;
  columnName?: string;
  description: string;
  headerColWidth: number;
  headerColAlign?: Table.ColumnHeaderCellProps["align"];
  headerColor?: string;
  wrap?: boolean;
}

export interface ColumnGroup {
  name: string;
  headerRenderer?: () => JSX.Element | null;
  pinned?: boolean;
  columns: ColumnDefinition[];
}

export interface DataTableProps {
  groups: ColumnGroup[];
  TableBody: (props: { isPinned?: boolean }) => JSX.Element | null;
  style?: CSSProperties;
  hideGroupHeaders?: boolean;
}

export default function DataTable({
  groups,
  TableBody,
  style,
  hideGroupHeaders,
}: DataTableProps) {
  return (
    <Flex>
      <InnerTable
        groups={groups}
        TableBody={TableBody}
        style={style}
        hideGroupHeaders={hideGroupHeaders}
        isPinned
      />
      <InnerTable
        groups={groups}
        TableBody={TableBody}
        style={style}
        hideGroupHeaders={hideGroupHeaders}
      />
    </Flex>
  );
}

interface InnerTableProps {
  groups: ColumnGroup[];
  TableBody: DataTableProps["TableBody"];
  style?: CSSProperties;
  isPinned?: boolean;
  hideGroupHeaders?: boolean;
}

function InnerTable({
  groups: allGroups,
  TableBody,
  style,
  isPinned,
  hideGroupHeaders,
}: InnerTableProps) {
  const groups = useMemo(
    () => allGroups.filter(({ pinned }) => !!pinned === !!isPinned),
    [allGroups, isPinned],
  );

  const rootStyle = useMemo(() => {
    if (!isPinned) return { ...style, minWidth: "0px" };

    // start with one pixel to account for border width
    const pinnedTableWidth = `${groups.reduce((acc, group) => {
      for (const column of group.columns) {
        acc += column.headerColWidth;
      }
      return acc;
    }, 1)}px`;

    return {
      ...style,
      minWidth: pinnedTableWidth,
      flexBasis: pinnedTableWidth,
    };
  }, [groups, isPinned, style]);

  return (
    <Table.Root
      variant="ghost"
      className={clsx(styles.root, styles.table)}
      size="1"
      style={rootStyle}
    >
      <TableHeader
        groups={groups}
        isPinned={isPinned}
        hideGroupHeaders={hideGroupHeaders}
      />

      <TableBody isPinned={isPinned} />
    </Table.Root>
  );
}

interface TableHeaderProps {
  groups: ColumnGroup[];
  isPinned?: boolean;
  hideGroupHeaders?: boolean;
}

function TableHeader({ groups, isPinned, hideGroupHeaders }: TableHeaderProps) {
  return (
    <>
      <colgroup>
        {groups.map((group) =>
          group.columns.map((column) => (
            <col
              key={column.uniqueName}
              style={{ width: column.headerColWidth }}
            />
          )),
        )}
      </colgroup>

      <Table.Header className={styles.header}>
        {!hideGroupHeaders && (
          <Table.Row>
            {groups.map((group, i) => (
              <Table.ColumnHeaderCell
                key={group.name}
                colSpan={group.columns.length}
                className={clsx(styles.groupHeader, {
                  [styles.rightBorder]: isPinned || i !== groups.length - 1,
                })}
              >
                {group.headerRenderer ? <group.headerRenderer /> : group.name}
              </Table.ColumnHeaderCell>
            ))}
          </Table.Row>
        )}

        <Table.Row className={styles.lightBorderBottom}>
          {groups.map((group, i) =>
            group.columns.map((column, j) => (
              <Table.ColumnHeaderCell
                key={column.uniqueName}
                align={column.headerColAlign}
                className={clsx({
                  [styles.wrap]: !!column.wrap,
                  [styles.rightBorder]:
                    isPinned ||
                    // last field (except in last group) has right border
                    (i !== groups.length - 1 && j === group.columns.length - 1),
                })}
                style={
                  column.headerColor ? { color: column.headerColor } : undefined
                }
              >
                {column.columnName ?? column.uniqueName}
              </Table.ColumnHeaderCell>
            )),
          )}
        </Table.Row>
      </Table.Header>
    </>
  );
}
