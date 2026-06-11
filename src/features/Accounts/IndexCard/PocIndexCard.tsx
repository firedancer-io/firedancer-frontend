import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../Stat";
import Progress from "../../../components/Progress";
import {
  createUnitFormatter,
  formatSIBytes,
  type CountUnit,
} from "../../../utils";

const formatIndexCount = createUnitFormatter<CountUnit>([
  { unit: "", divisor: 1, threshold: 10_000 },
  { unit: "k", divisor: 1_000, threshold: 10_000_000 },
  { unit: "M", divisor: 1_000_000, threshold: 10_000_000_000 },
  { unit: "B", divisor: 1_000_000_000, threshold: 10_000_000_000_000 },
  { unit: "T", divisor: 1_000_000_000, threshold: Infinity },
]);

export default function PocIndexCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const total = formatIndexCount(accountStats.disk.accounts_total);
  const capacity = formatIndexCount(accountStats.disk.accounts_capacity);
  const pct = accountStats.disk.accounts_capacity
    ? (accountStats.disk.accounts_total / accountStats.disk.accounts_capacity) *
      100
    : 0;

  const accdbTiles = accountStats.tiles.filter((t) => t.name === "accdb");
  const diskReadTotal = accdbTiles.reduce((a, t) => a + t.bytes_read, 0);
  const diskWriteTotal = accdbTiles.reduce((a, t) => a + t.bytes_written, 0);
  const fmtReadTotal = formatSIBytes(diskReadTotal);
  const fmtWriteTotal = formatSIBytes(diskWriteTotal);

  return (
    <Card>
      <Flex direction="column" gap="7px" minWidth="180px">
        <CardHeader text="Accounts DB" />
        <Flex direction="column">
          <Stat
            value={`${total.value} ${total.unit}`}
            size="lg"
            color="var(--orange-11)"
            suffix={`/ ${capacity.value} ${capacity.unit}`}
          />
          <Progress value={pct} />
        </Flex>
        <Stat label="Used" value={`${pct.toFixed(1)}%`} />
        <Flex justify="between" gap="2">
          <Stat
            label="Total Read"
            value={`${fmtReadTotal.value} ${fmtReadTotal.unit}`}
          />
          <Stat
            label="Total Written"
            value={`${fmtWriteTotal.value} ${fmtWriteTotal.unit}`}
          />
        </Flex>
      </Flex>
    </Card>
  );
}
