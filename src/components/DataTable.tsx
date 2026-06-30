import clsx from "clsx";

import styles from "./dataTable.module.css";
import { useMemo, type CSSProperties } from "react";

export interface ColumnDefinition {
  uniqueName: string;
  columnName?: string;
  description: string;
  headerColWidth: number;
  headerColAlign?: "left" | "center" | "right";
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
    <div className={styles.container}>
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
    </div>
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

  const tableWidth = useMemo(
    () =>
      groups.reduce((acc, group) => {
        for (const column of group.columns) acc += column.headerColWidth;
        return acc;
      }, 0),
    [groups],
  );

  return (
    <div
      className={clsx(
        styles.root,
        isPinned ? styles.pinned : styles.scrollable,
      )}
      style={{ "--table-width": `${tableWidth}px` } as CSSProperties}
    >
      <table className={styles.table} style={style}>
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
        <TableHeader
          groups={groups}
          isPinned={isPinned}
          hideGroupHeaders={hideGroupHeaders}
        />

        <TableBody isPinned={isPinned} />
      </table>
    </div>
  );
}

interface TableHeaderProps {
  groups: ColumnGroup[];
  isPinned?: boolean;
  hideGroupHeaders?: boolean;
}

function TableHeader({ groups, isPinned, hideGroupHeaders }: TableHeaderProps) {
  return (
    <thead className={styles.header}>
      {!hideGroupHeaders && (
        <tr>
          {groups.map((group, i) => (
            <th
              key={group.name}
              colSpan={group.columns.length}
              className={clsx(styles.groupHeader, {
                [styles.rightBorder]: isPinned || i !== groups.length - 1,
              })}
            >
              {group.headerRenderer ? <group.headerRenderer /> : group.name}
            </th>
          ))}
        </tr>
      )}

      <tr className={styles.lightBorderBottom}>
        {groups.map((group, i) =>
          group.columns.map((column, j) => (
            <th
              key={column.uniqueName}
              align={column.headerColAlign}
              className={clsx({
                [styles.wrap]: !!column.wrap,
                [styles.rightBorder]:
                  isPinned ||
                  // last field (except in last group) has right border
                  (i !== groups.length - 1 && j === group.columns.length - 1),
              })}
            >
              {column.columnName ?? column.uniqueName}
            </th>
          )),
        )}
      </tr>
    </thead>
  );
}
