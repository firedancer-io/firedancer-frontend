import { Table } from "@radix-ui/themes";
import byteSize from "byte-size";
import { useValuePerSecond } from "../../StartupProgress/Firedancer/useValuePerSecond";

interface RateTableCellProps {
  inBytes?: boolean;
  value: number;
}

export default function RateTableCell({ inBytes, value }: RateTableCellProps) {
  const { valuePerSecond } = useValuePerSecond(value, 5_000) ?? 0;

  const formattedValue =
    valuePerSecond !== undefined
      ? inBytes
        ? byteSize(valuePerSecond).toString()
        : Math.trunc(valuePerSecond).toLocaleString()
      : "-";
  return <Table.Cell>{formattedValue} /s</Table.Cell>;
}
