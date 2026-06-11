import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatCount, formatIECBytes } from "../../../utils";
import Stat from "../Stat";

import styles from "./cacheCard.module.css";
import { cacheClassList } from "../consts";

export default function CacheCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const cacheClasses = accountStats.cache.classes;

  const hitRate = accountStats.cache.hit_rate_ema * 100;
  const readsPerSec = formatCount(
    Math.max(
      0,
      accountStats.io.acquired_per_sec -
        accountStats.io.acquired_writable_per_sec,
    ),
  );
  const writesPerSec = formatCount(accountStats.io.acquired_writable_per_sec);

  const usedSlots = cacheClasses.reduce((a, c) => a + c.used_slots, 0);
  const maxSlots = cacheClasses.reduce((a, c) => a + c.max_slots, 0);
  const fmtUsedSlots = formatCount(usedSlots, 2);
  const fmtMaxSlots = formatCount(maxSlots, 2);

  const sizeBytes = formatIECBytes(accountStats.cache.size_bytes, 2);
  const usedBytes = formatIECBytes(
    cacheClasses.reduce(
      (a, c) => a + c.used_slots * (cacheClassList[c.class]?.bytes ?? 0),
      0,
    ),
    2,
  );

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <CardHeader text="Cache" />
        <Flex direction="column">
          <Flex gap="8px" align="baseline">
            <Stat
              className={styles.pct}
              value={hitRate.toFixed(2)}
              size="lg"
              color="#EC5D5E"
              suffix="% hit"
            />
            <Stat
              className={styles.perSecStat}
              value={`${readsPerSec.value}${readsPerSec.unit}`}
              color="var(--gray-12)"
              suffix="r/s"
            />
            <Stat
              className={styles.perSecStat}
              value={`${writesPerSec.value}${writesPerSec.unit}`}
              color="var(--gray-12)"
              suffix="w/s"
            />
          </Flex>
        </Flex>
        <Flex justify="between" gap="2">
          <Stat
            label="Used"
            value={`${usedBytes.value} ${usedBytes.unit}`}
            suffix={`/ ${sizeBytes.value} ${sizeBytes.unit}`}
          />
          <Stat
            label="Slots"
            value={`${fmtUsedSlots.value} ${fmtUsedSlots.unit}`}
            suffix={`/ ${fmtMaxSlots.value} ${fmtMaxSlots.unit}`}
          />
        </Flex>
      </Flex>
    </Card>
  );
}
