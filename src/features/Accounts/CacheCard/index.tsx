import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import {
  formatCount,
  formatHitRate,
  formatIECBytesFraction,
  formatSIBytes,
} from "../../../utils";
import Stat, { FractionStat } from "../Stat";

import { cacheClassList } from "../consts";
import {
  accountsReadColor,
  accountsWriteColor,
  goodChangedColor,
  averageChangedColor,
  badChangedColor,
} from "../../../colors";

export default function CacheCard({ className }: { className?: string }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const cacheClasses = accountStats.cache.classes;

  const hitRateColor =
    accountStats.cache.hit_rate_ema < 0.99
      ? badChangedColor
      : accountStats.cache.hit_rate_ema < 0.995
        ? averageChangedColor
        : goodChangedColor;

  const readsPerSec = formatCount(
    Math.max(
      0,
      accountStats.io.acquired_per_sec -
        accountStats.io.acquired_writable_per_sec,
    ),
  );
  const writesPerSec = formatCount(accountStats.io.acquired_writable_per_sec);
  const copiedPerSec = formatSIBytes(accountStats.io.bytes_copied_per_sec);

  const { numerator: usedBytes, denominator: sizeBytes } =
    formatIECBytesFraction(
      cacheClasses.reduce(
        (a, c) => a + c.used_slots * (cacheClassList[c.class]?.bytes ?? 0),
        0,
      ),
      accountStats.cache.size_bytes,
      2,
    );

  return (
    <Card className={className}>
      <Flex direction="column" justify="between" height="100%" gap="5px">
        <CardHeader text="Cache" />

        <Stat
          value={formatHitRate(accountStats.cache.hit_rate_ema)}
          size="lg"
          color={hitRateColor}
          suffix="% hit"
        />

        <Flex gap="17px" align="baseline">
          <Stat
            label="Reads"
            value={`${readsPerSec.value}${readsPerSec.unit}`}
            color={accountsReadColor}
            suffix="r/s"
            minWidth="80px"
          />
          <Stat
            label="Writes"
            value={`${writesPerSec.value}${writesPerSec.unit}`}
            color={accountsWriteColor}
            suffix="w/s"
            minWidth="80px"
          />
        </Flex>

        <Flex gap="17px" align="baseline">
          <Stat
            label="Copied"
            value={copiedPerSec.value}
            suffix={`${copiedPerSec.unit}/s`}
            minWidth="80px"
          />
          <FractionStat
            label="Used"
            numerator={usedBytes}
            denominator={sizeBytes}
            minWidth="225px"
          />
        </Flex>
      </Flex>
    </Card>
  );
}
