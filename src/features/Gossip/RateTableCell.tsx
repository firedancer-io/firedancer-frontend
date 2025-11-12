import { Table } from "@radix-ui/themes";
import byteSize from "byte-size";
import { useEmaValue } from "../../hooks/useEma";

interface RateTableCellProps {
  inBytes?: boolean;
  value: number;
}

export default function EmaTableCell({ inBytes, value }: RateTableCellProps) {
  const emaValue = useEmaValue(value) ?? 0;

  const formattedValue =
    emaValue !== undefined
      ? inBytes
        ? byteSize(emaValue).toString()
        : Math.trunc(emaValue).toLocaleString()
      : "-";
  return <Table.Cell align="right">{formattedValue}</Table.Cell>;
}
