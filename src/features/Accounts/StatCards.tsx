import { Card, Flex, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import type { AccountsStats } from "../../api/types";
import { formatBytes } from "../../utils";
import styles from "./accounts.module.css";

interface StatCardsProps {
  stats: AccountsStats;
}

function bstr(bytes: number) {
  const b = formatBytes(bytes);
  return `${b.value} ${b.unit}`;
}

function rateStr(bytesPerSec: number) {
  if (!bytesPerSec) return "0 B/s";
  const b = formatBytes(bytesPerSec);
  return `${b.value} ${b.unit}/s`;
}

function fmtOps(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return Math.round(v).toLocaleString();
}

function StatCard({
  label,
  value,
  sub,
  bar,
  valueTone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  bar?: number;
  valueTone?: "warn" | "danger";
}) {
  const valueClass =
    valueTone === "danger"
      ? `${styles.statValue} ${styles.statValueDanger}`
      : valueTone === "warn"
        ? `${styles.statValue} ${styles.statValueWarn}`
        : styles.statValue;
  return (
    <Card className={styles.statCard}>
      <Flex direction="column" gap="6px" minWidth="0" height="100%">
        <Text className={styles.statLabel}>{label}</Text>
        <Text className={valueClass}>{value}</Text>
        {bar !== undefined && (
          <div className={styles.statBar}>
            <div
              className={styles.statBarFill}
              style={{ width: `${Math.min(100, bar).toFixed(1)}%` }}
            />
          </div>
        )}
        {sub !== undefined && <Text className={styles.statSub}>{sub}</Text>}
      </Flex>
    </Card>
  );
}

export function StatCards({ stats }: StatCardsProps) {
  const { disk, compaction, cache, io, partitions } = stats;

  const compactingPartition = partitions?.find((p) => p.compaction_state === 2);
  const compactingRegion = compactingPartition
    ? compactingPartition.used_frac + compactingPartition.fragmented_frac
    : 0;
  const compactionProgress =
    compactingPartition && compactingRegion > 0
      ? Math.min(
          100,
          (compactingPartition.compaction_frac / compactingRegion) * 100,
        )
      : 0;

  const diskPct = disk.allocated_bytes
    ? (disk.used_bytes / disk.allocated_bytes) * 100
    : 0;
  const accountsPct = disk.accounts_capacity
    ? (disk.accounts_total / disk.accounts_capacity) * 100
    : 0;

  const cacheUsedSlots = cache.classes.reduce((a, c) => a + c.used_slots, 0);
  const cacheMaxSlots = cache.classes.reduce((a, c) => a + c.max_slots, 0);
  const cachePct = cacheMaxSlots ? (cacheUsedSlots / cacheMaxSlots) * 100 : 0;

  const CACHE_CLASS_BYTES = [
    128, 512, 2048, 8192, 32768, 131072, 1048576, 10485760,
  ];
  const cacheUsedBytes = cache.classes.reduce(
    (a, c) => a + c.used_slots * (CACHE_CLASS_BYTES[c.class] ?? 0),
    0,
  );

  const readsPerSec = Math.max(
    0,
    io.acquired_per_sec - io.acquired_writable_per_sec,
  );
  const writesPerSec = io.acquired_writable_per_sec;

  const fragBytes =
    disk.current_bytes > disk.used_bytes
      ? disk.current_bytes - disk.used_bytes
      : 0;
  const fragPct = disk.current_bytes
    ? (fragBytes / disk.current_bytes) * 100
    : 0;

  const hitRatePct = cache.hit_rate_ema * 100;
  const prewriteRatioPct = io.prewrite_ratio * 100;

  return (
    <Flex gap="16px" wrap="wrap">
      <StatCard
        label="Disk"
        value={
          <>
            {bstr(disk.used_bytes)}
            <Text className={styles.statValueSuffix}>
              {" / "}
              {bstr(disk.allocated_bytes)}
            </Text>
          </>
        }
        bar={diskPct}
        sub={`${diskPct.toFixed(1)}% used · ${bstr(fragBytes)} (${fragPct.toFixed(1)}%) fragmentation`}
      />
      <StatCard
        label="Index"
        value={
          <>
            {(disk.accounts_total / 1e6).toFixed(1)}
            <Text className={styles.statValueSuffix}>
              {" / "}
              {(disk.accounts_capacity / 1e6).toFixed(1)} M
            </Text>
          </>
        }
        valueTone={
          accountsPct > 98 ? "danger" : accountsPct > 90 ? "warn" : undefined
        }
        bar={accountsPct}
        sub={`${accountsPct.toFixed(1)}% used`}
      />
      <StatCard
        label="Cache"
        value={
          <>
            <Text
              className={
                hitRatePct >= 100
                  ? styles.statHitRateGood
                  : hitRatePct > 99.9
                    ? styles.statHitRateWarn
                    : styles.statHitRateBad
              }
            >
              {hitRatePct.toFixed(2)}
            </Text>
            <Text className={styles.statValueSuffix}>% hit · </Text>
            <Text className={styles.statValueSecondary}>
              {fmtOps(readsPerSec)}
            </Text>
            <Text className={styles.statValueSuffix}> r/s · </Text>
            <Text className={styles.statValueSecondary}>
              {fmtOps(writesPerSec)}
            </Text>
            <Text className={styles.statValueSuffix}> w/s</Text>
          </>
        }
        bar={cachePct}
        sub={`${(cache.size_bytes / 1024 ** 3).toFixed(0)} GiB cache · ${(cacheUsedBytes / 1024 ** 3).toFixed(1)} GiB used · ${(cacheUsedSlots / 1e6).toFixed(2)} / ${(cacheMaxSlots / 1e6).toFixed(2)} M slots`}
      />
      <StatCard
        label={
          <>
            Compaction
            <Text
              className={
                compaction.in_compaction
                  ? styles.statLabelStatusActive
                  : styles.statLabelStatusIdle
              }
            >
              {compaction.in_compaction ? "(IN PROGRESS)" : "(IDLE)"}
            </Text>
          </>
        }
        value={
          <>
            {compaction.compactions_completed.toLocaleString()}
            <Text className={styles.statValueSuffix}>
              {" / "}
              {compaction.compactions_requested.toLocaleString()} completed
            </Text>
          </>
        }
        bar={compactionProgress}
        sub={`${rateStr(compaction.relocated_bytes_per_sec)} relocated`}
      />
      <StatCard
        label="IO"
        value={
          <>
            {rateStr(io.bytes_read_per_sec)}
            <Text className={styles.statValueSuffix}> read · </Text>
            <Text className={styles.statValueSecondary}>
              {rateStr(io.bytes_written_per_sec)}
            </Text>
            <Text className={styles.statValueSuffix}> write</Text>
          </>
        }
        sub={
          <>
            {rateStr(io.bytes_copied_per_sec)} copied ·{" "}
            {io.read_ops_per_sec.toFixed(0)} r/s ·{" "}
            {io.write_ops_per_sec.toFixed(0)} w/s · prewrite{" "}
            {prewriteRatioPct.toFixed(1)}%
          </>
        }
      />
    </Flex>
  );
}
