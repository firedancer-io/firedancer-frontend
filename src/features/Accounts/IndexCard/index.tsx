import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../Stat";
import Progress from "../../../components/Progress";
import type { CountUnit } from "../../../utils";
import { createUnitFormatter } from "../../../utils";

const formatIndexCount = createUnitFormatter<CountUnit>([
  { unit: "", divisor: 1, threshold: 10_000 },
  { unit: "k", divisor: 1_000, threshold: 10_000_000 },
  { unit: "M", divisor: 1_000_000, threshold: 10_000_000_000 },
  { unit: "B", divisor: 1_000_000_000, threshold: 10_000_000_000_000 },
  { unit: "T", divisor: 1_000_000_000_000, threshold: Infinity },
]);

export default function IndexCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const total = formatIndexCount(accountStats.disk.accounts_total);
  const capacity = formatIndexCount(accountStats.disk.accounts_capacity);
  const pct = accountStats.disk.accounts_capacity
    ? (accountStats.disk.accounts_total / accountStats.disk.accounts_capacity) *
      100
    : 0;

  return (
    <Card>
      <Flex direction="column" gap="7px" minWidth="180px">
        <CardHeader text="Index" />
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
      </Flex>
    </Card>
  );
}
