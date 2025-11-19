import { useAtomValue } from "jotai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEventHandler,
} from "react";
import type { ListRange, TableComponents } from "react-virtuoso";
import { TableVirtuoso } from "react-virtuoso";
import { gossipPeersSizeAtom } from "../../../api/atoms";
import usePeerTableQuery, { type SortOrder } from "./usePeerTableQuery";
import { Box, Flex, Reset, Separator, Table, Text } from "@radix-ui/themes";
import { lamportsPerSol } from "../../../consts";
import byteSize from "byte-size";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import { useKey } from "react-use";
import { copyToClipboard } from "../../../utils";
import styles from "./peerTable.module.css";
import clsx from "clsx";
import { headerGap } from "../consts";

const defaultTableSize = 1_000;
const buffer = 0;

interface ColSpec {
  width?: number;
  format?: (value: string | number) => string;
  align?: "left" | "right";
}
const byteFormat = (value: number | string) => {
  if (typeof value === "number") {
    const formatted = byteSize(value);
    return `${formatted.value} ${formatted.unit}`;
  }
  return value;
};

const colSpecs: Record<string, ColSpec> = {
  Stake: {
    width: 80,
    align: "right",
    format: (value) => {
      return typeof value === "number"
        ? Math.abs(Math.trunc(value / lamportsPerSol)).toLocaleString()
        : value;
    },
  },
  Pubkey: { width: 200 },
  ["IP Addr"]: { width: 80 },
  ["Ingress Pull"]: {
    width: 80,
    align: "right",
    format: byteFormat,
  },
  ["Ingress Push"]: { width: 80, align: "right", format: byteFormat },
  ["Egress Pull"]: { width: 80, align: "right", format: byteFormat },
  ["Egress Push"]: { width: 80, align: "right", format: byteFormat },
};

const defaultColSpec = {
  width: 150,
} as const;

function getColSpec(colId: string) {
  return colSpecs[colId] ?? defaultColSpec;
}

export default function PeerTable() {
  const size = useAtomValue(gossipPeersSizeAtom) ?? defaultTableSize;
  const { query, sort, colIds, rowsCacheRef, colSorting } = usePeerTableQuery();
  const [selectedCell, setSelectedCell] = useState(() => ({
    row: -1,
    colId: "",
  }));
  const [selectedCellCopied, setSelectedCellCopied] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    Object.fromEntries(
      colIds.map((id) => [id, getColSpec(id).width ?? defaultColSpec.width]),
    ),
  );

  useEffect(() => {
    setColWidths(
      Object.fromEntries(
        colIds.map((id) => [id, getColSpec(id).width ?? defaultColSpec.width]),
      ),
    );
  }, [colIds]);

  const onRangeChanged = useCallback(
    ({ startIndex, endIndex }: ListRange) => {
      const start = Math.max(0, startIndex - buffer);
      const end = Math.min(
        endIndex + buffer,
        size > 0 ? size - 1 : endIndex + buffer,
      );
      query(start, end);
    },
    [query, size],
  );

  const components = useMemo(
    () => getComponents(colIds, colWidths),
    [colIds, colWidths],
  );

  const selectedCellRef = useRef(selectedCell);
  selectedCellRef.current = selectedCell;
  useKey("c", (e) => {
    if (e.ctrlKey) {
      const row = rowsCacheRef.current?.get(
        selectedCellRef.current.row.toString(),
      );
      const value = row?.[selectedCellRef.current.colId];
      if (value) {
        copyToClipboard(value.toString());
        setSelectedCellCopied(true);
        setTimeout(() => {
          setSelectedCellCopied(false);
        }, 500);
      }
    }
  });

  const handleResize = useCallback((colId: string, width: number) => {
    setColWidths((prev) => ({
      ...prev,
      [colId]: Math.max(width, getColSpec(colId).width ?? defaultColSpec.width),
    }));
  }, []);

  return (
    <Flex direction="column" gap={headerGap} flexGrow="1">
      <Text className={styles.headerText}>Peers</Text>
      <Box flexGrow="1" minHeight="300px" asChild>
        <TableVirtuoso
          className={clsx(
            "rt-TableRoot",
            "rt-r-size-1",
            "rt-variant-surface",
            styles.peerTable,
          )}
          totalCount={size}
          increaseViewportBy={200}
          rangeChanged={onRangeChanged}
          components={components}
          itemContent={(index) => {
            const row = rowsCacheRef.current?.get(index.toString());
            if (!row) {
              return colIds?.length ? (
                <>
                  {colIds.map((colId) => {
                    return <Table.Cell key={colId}>&nbsp;</Table.Cell>;
                  })}
                </>
              ) : (
                <>
                  <Table.Cell>&nsbsp;</Table.Cell>
                </>
              );
            }

            return colIds.map((colId) => {
              const colSpec = getColSpec(colId);
              const align = colSpec.align;
              const format = colSpec.format;
              const value = row?.[colId];
              const isSelected =
                selectedCell.row === index && selectedCell.colId === colId;

              return (
                <Table.Cell
                  key={colId}
                  align={align}
                  onClick={() => setSelectedCell({ row: index, colId })}
                  style={{
                    outline: isSelected
                      ? `1px dashed var(--gray-${selectedCellCopied ? 11 : 10})`
                      : "none",
                    outlineOffset: -2,
                  }}
                >
                  <Text truncate as="div">
                    {format ? format(value) : value}
                  </Text>
                </Table.Cell>
              );
            });
          }}
          fixedHeaderContent={() => (
            <Table.Row>
              {colIds.map((colId) => {
                const { align } = getColSpec(colId);
                const sortDirection =
                  colSorting.id === colId ? colSorting.direction : undefined;

                const startDrag: PointerEventHandler = (e) => {
                  e.preventDefault();

                  const startX = e.clientX;
                  const startW = colWidths[colId];

                  const onMove = (mouseEvent: globalThis.PointerEvent) =>
                    handleResize(colId, startW + (mouseEvent.clientX - startX));

                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                };

                return (
                  <Table.ColumnHeaderCell key={colId} align={align} p="0">
                    <Flex align="center" height="100%">
                      <Reset>
                        <Box flexGrow="1" className={styles.headerCell} asChild>
                          <button onClick={() => sort(colId)}>
                            <Flex
                              align="center"
                              gap="1"
                              justify={align === "right" ? "end" : "start"}
                            >
                              {align === "right" && (
                                <CaretIcons direction={sortDirection} />
                              )}
                              <Text truncate title={colId} as="div">
                                {colId}
                              </Text>
                              {align !== "right" && (
                                <CaretIcons direction={sortDirection} />
                              )}
                            </Flex>
                          </button>
                        </Box>
                      </Reset>
                      <div
                        style={{
                          paddingLeft: "8px",
                          paddingRight: "2px",
                          cursor: "col-resize",
                        }}
                        onPointerDown={startDrag}
                      >
                        <Separator
                          orientation="vertical"
                          size="2"
                          className={styles.headerSeparator}
                        />
                      </div>
                    </Flex>
                  </Table.ColumnHeaderCell>
                );
              })}
            </Table.Row>
          )}
        />
      </Box>
    </Flex>
  );
}

interface CaretIconsProps {
  direction?: SortOrder;
}

function CaretIcons({ direction }: CaretIconsProps) {
  return (
    <>
      {direction === -1 && <CaretDownIcon height={12} width={12} />}
      {direction === 1 && <CaretUpIcon height={12} width={12} />}
    </>
  );
}

function getComponents(
  colIds: string[],
  colWidths: Record<string, number>,
): TableComponents {
  return {
    Table: (props) => (
      <table
        {...props}
        className="rt-TableRootTable"
        style={{ ...props.style, overflow: "inherit", tableLayout: "fixed" }}
      >
        <colgroup>
          {colIds.map((colId) => (
            <col key={colId} style={{ width: colWidths[colId] }} />
          ))}
        </colgroup>
        {props.children}
      </table>
    ),
    TableHead: (props) => (
      <Table.Header
        {...props}
        style={{ ...props.style, background: "#0e131c" }}
      />
    ),
    TableRow: (props) => <Table.Row {...props} />,
  };
}
