import clsx from "clsx";

import styles from "./dataTable.module.css";
import { memo, useMemo, type CSSProperties, type ComponentType } from "react";

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

interface DataTableProps<TRow, TPinnedData, TScrollableData> {
  groups: ColumnGroup[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  getPinnedData: (row: TRow) => TPinnedData;
  getScrollableData: (row: TRow) => TScrollableData;
  PinnedRow: ComponentType<{ data: TPinnedData }>;
  ScrollableRow: ComponentType<{ data: TScrollableData }>;
  pinnedDataEqualityFn?: (a: TPinnedData, b: TPinnedData) => boolean;
  scrollableDataEqualityFn?: (
    a: TScrollableData,
    b: TScrollableData,
  ) => boolean;
  style?: CSSProperties;
  hideGroupHeaders?: boolean;
}

export default function DataTable<TRow, TPinnedData, TScrollableData>({
  groups,
  rows,
  getRowKey,
  getPinnedData,
  getScrollableData,
  PinnedRow,
  ScrollableRow,
  pinnedDataEqualityFn,
  scrollableDataEqualityFn,
  style,
  hideGroupHeaders,
}: DataTableProps<TRow, TPinnedData, TScrollableData>) {
  const pinnedGroups = useMemo(
    () => groups.filter(({ pinned }) => !!pinned),
    [groups],
  );
  const scrollableGroups = useMemo(
    () => groups.filter(({ pinned }) => !pinned),
    [groups],
  );

  return (
    <div className={styles.container}>
      <MInnerTable
        groups={pinnedGroups}
        rows={rows}
        getRowKey={getRowKey}
        getData={getPinnedData}
        RowRenderer={PinnedRow}
        equalityFn={pinnedDataEqualityFn}
        style={style}
        hideGroupHeaders={hideGroupHeaders}
        isPinned
      />
      <MInnerTable
        groups={scrollableGroups}
        rows={rows}
        getRowKey={getRowKey}
        getData={getScrollableData}
        RowRenderer={ScrollableRow}
        equalityFn={scrollableDataEqualityFn}
        style={style}
        hideGroupHeaders={hideGroupHeaders}
      />
    </div>
  );
}

interface InnerTableProps<TRow, TData> {
  groups: ColumnGroup[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  getData: (row: TRow) => TData;
  RowRenderer: ComponentType<{ data: TData }>;
  equalityFn?: (a: TData, b: TData) => boolean;
  style?: CSSProperties;
  isPinned?: boolean;
  hideGroupHeaders?: boolean;
}

function InnerTable<TRow, TData>({
  groups,
  rows,
  getRowKey,
  getData,
  RowRenderer,
  equalityFn,
  style,
  isPinned,
  hideGroupHeaders,
}: InnerTableProps<TRow, TData>) {
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
        <TableColGroup groups={groups} />
        <TableHeader
          groups={groups}
          isPinned={isPinned}
          hideGroupHeaders={hideGroupHeaders}
        />
        <tbody>
          {rows.map((row) => (
            <MRow
              key={getRowKey(row)}
              data={getData(row)}
              RowRenderer={RowRenderer}
              equalityFn={equalityFn}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MInnerTable = memo(InnerTable) as typeof InnerTable;

interface TableColGroupProps {
  groups: ColumnGroup[];
}

function TableColGroup({ groups }: TableColGroupProps) {
  return (
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

interface RowProps<TData> {
  data: TData;
  RowRenderer: ComponentType<{ data: TData }>;
  equalityFn?: (a: TData, b: TData) => boolean;
}

function Row<TData>({ data, RowRenderer }: RowProps<TData>) {
  return <RowRenderer data={data} />;
}
const MRow = memo(Row, (prev, next) => {
  if (prev.RowRenderer !== next.RowRenderer) return false;
  if (prev.equalityFn) return prev.equalityFn(prev.data, next.data);
  return prev.data === next.data;
}) as typeof Row;
