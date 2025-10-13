import { Table } from "@radix-ui/themes";
import byteSize from "byte-size";
import { useValuePerSecond } from "../../StartupProgress/Firedancer/useValuePerSecond";

interface RateTableCellProps {
  inBytes?: boolean;
  value: number;
}

export default function RateTableCell({ inBytes, value }: RateTableCellProps) {
  const rate = useValuePerSecond(value, 5_000) ?? 0;

  const formattedValue = inBytes
    ? byteSize(rate.valuePerSecond ?? 0).toString()
    : Math.trunc(rate.valuePerSecond ?? 0).toLocaleString();
  return <Table.Cell>{formattedValue} /s</Table.Cell>;
}
