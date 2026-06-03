import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatBytes } from "../../../utils";
import Stat from "../Stat";
import Progress from "../../../components/Progress";

export default function DiskCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const used = formatBytes(accountStats.disk.used_bytes);
  const allocated = formatBytes(accountStats.disk.allocated_bytes);
  const pct = accountStats.disk.allocated_bytes
    ? (accountStats.disk.used_bytes / accountStats.disk.allocated_bytes) * 100
    : 0;
  const fragBytes =
    accountStats.disk.current_bytes > accountStats.disk.used_bytes
      ? accountStats.disk.current_bytes - accountStats.disk.used_bytes
      : 0;
  const frag = formatBytes(fragBytes);
  const fragPct = accountStats.disk.current_bytes
    ? (fragBytes / accountStats.disk.current_bytes) * 100
    : 0;

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <CardHeader text="Disk" />
        <Flex direction="column">
          <Stat
            value={`${used.value} ${used.unit}`}
            size="lg"
            color="var(--gray-11)"
            suffix={`/ ${allocated.value} ${allocated.unit}`}
          />
          <Progress value={pct} />
        </Flex>
        <Flex justify="between" gap="2">
          <Stat label="Used" value={`${pct.toFixed(1)}%`} />
          <Stat
            label="Fragmentation"
            value={`${frag.value} ${frag.unit}`}
            color="#FF3C3C"
            suffix={`${fragPct.toFixed(1)}%`}
          />
        </Flex>
      </Flex>
    </Card>
  );
}
