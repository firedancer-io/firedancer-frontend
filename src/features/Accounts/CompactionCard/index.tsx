import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../Stat";
import Progress from "../../../components/Progress";

import styles from "./compactionCard.module.css";
import { formatSIBytes } from "../../../utils";

export default function CompactionCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const isCompacting = accountStats.compaction.in_compaction;
  const partition = accountStats.partitions?.find(
    (p) => p.compaction_state === 2,
  );
  const region = partition
    ? partition.used_frac + partition.fragmented_frac
    : 0;
  const compactionPct =
    partition && region > 0
      ? Math.min(100, (partition.compaction_frac / region) * 100)
      : 0;
  const relocatedPerSec = formatSIBytes(
    accountStats.compaction.relocated_bytes_per_sec,
  );

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex gap="5px">
          <CardHeader text="Compaction" />
          <CardHeader
            className={isCompacting ? styles.inProgress : styles.idle}
            text={isCompacting ? "In Progress" : "Idle"}
          />
        </Flex>
        <Flex direction="column">
          <Stat
            value={accountStats.compaction.compactions_completed.toLocaleString()}
            size="lg"
            suffix={`/ ${accountStats.compaction.compactions_requested} Completed`}
          />
          <Progress value={compactionPct} />
        </Flex>
        <Flex justify="between" gap="2">
          <Stat
            label="Relocated"
            value={`${relocatedPerSec.value} ${relocatedPerSec.unit}/s`}
          />
          <Stat
            label="Next Compaction in"
            value="TODO CALC"
            color="var(--gray-12)"
          />
        </Flex>
      </Flex>
    </Card>
  );
}
