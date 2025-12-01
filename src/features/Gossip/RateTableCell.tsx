import { Table } from "@radix-ui/themes";
import { useEmaValue } from "../../hooks/useEma";
import { formatBytesAsBits } from "../../utils";

interface RateTableCellProps {
  inBytes?: boolean;
  value: number;
}

export default function EmaTableCell({ inBytes, value }: RateTableCellProps) {
  const emaValue = useEmaValue(value) ?? 0;

  let formattedValue = "-";
  if (emaValue !== undefined) {
    if (inBytes) {
      const { value, unit } = formatBytesAsBits(emaValue);
      formattedValue = `${value.toLocaleString()} ${unit}`;
    } else {
      formattedValue = Math.trunc(emaValue).toLocaleString();
    }
  }

  return <Table.Cell align="right">{formattedValue}</Table.Cell>;
}
