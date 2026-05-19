import { useRef } from "react";
import { Flex, Table, Text } from "@radix-ui/themes";
import type { AccountsStats } from "../../api/types";
import { formatBytes } from "../../utils";
import styles from "./accounts.module.css";

function UsageBar({
  usedFrac,
  fragmentedFrac,
  compactionTriggerFrac,
  isWriteHead,
  compactionFrac,
  compactionState,
}: {
  usedFrac: number;
  fragmentedFrac: number;
  compactionTriggerFrac: number;
  isWriteHead: boolean;
  compactionFrac: number;
  compactionState: number;
}) {
  const usedPct = Math.min(100, Math.max(0, (usedFrac || 0) * 100));
  const fragPct = Math.min(
    100 - usedPct,
    Math.max(0, (fragmentedFrac || 0) * 100),
  );
  const headPct = Math.min(100, usedPct + fragPct);
  const unusedPct = Math.max(0, 100 - headPct);
  const triggerFracPct = Math.max(0, (compactionTriggerFrac || 0) * 100);
  const triggerPct = Math.max(0, headPct - triggerFracPct);
  const showTrigger = triggerFracPct > 0 && triggerPct < headPct;

  const prevUsedRef = useRef(usedPct);
  const prevUsed = prevUsedRef.current;
  const deltaStart = Math.min(prevUsed, usedPct);
  const deltaWidth = Math.max(0, usedPct - prevUsed);
  prevUsedRef.current = usedPct;
  const fadeKey = `${deltaStart.toFixed(3)}-${deltaWidth.toFixed(3)}`;

  const prevFragRef = useRef(fragPct);
  const prevFrag = prevFragRef.current;
  const fragSolidWidth = Math.min(prevFrag, fragPct);
  const fragDeltaWidth = Math.max(0, fragPct - prevFrag);
  prevFragRef.current = fragPct;
  const fragFadeKey = `${usedPct.toFixed(3)}-${fragSolidWidth.toFixed(3)}-${fragDeltaWidth.toFixed(3)}`;

  const isCompacting = compactionState === 2;
  const compactionPct = Math.min(100, Math.max(0, (compactionFrac || 0) * 100));

  return (
    <div className={styles.barWrap}>
      <div className={styles.bar}>
        <div
          className={styles.barFill}
          style={{ width: `${deltaStart.toFixed(2)}%` }}
        />
        {deltaWidth > 0 && (
          <div
            key={fadeKey}
            className={`${styles.barFill} ${styles.barFillFade}`}
            style={{
              left: `${deltaStart.toFixed(2)}%`,
              width: `${deltaWidth.toFixed(2)}%`,
            }}
          />
        )}
        {fragDeltaWidth > 0 && (
          <div
            key={fragFadeKey}
            className={`${styles.barFillFrag} ${styles.barFillFade}`}
            style={{
              left: `${usedPct.toFixed(2)}%`,
              width: `${fragDeltaWidth.toFixed(2)}%`,
            }}
          />
        )}
        <div
          className={styles.barFillFrag}
          style={{
            left: `${(usedPct + fragDeltaWidth).toFixed(2)}%`,
            width: `${fragSolidWidth.toFixed(2)}%`,
          }}
        />
        {isCompacting && (
          <div
            className={styles.barCompactedOverlay}
            style={{ width: `${compactionPct.toFixed(2)}%` }}
          />
        )}
      </div>
      <div
        className={styles.barHit}
        style={{ left: "0", width: `${usedPct.toFixed(2)}%` }}
        title={`Used: ${usedPct.toFixed(1)}%`}
      />
      <div
        className={styles.barHit}
        style={{
          left: `${usedPct.toFixed(2)}%`,
          width: `${fragPct.toFixed(2)}%`,
        }}
        title={`Fragmented: ${fragPct.toFixed(1)}%`}
      />
      {isWriteHead && unusedPct > 0 && (
        <div
          className={styles.barHit}
          style={{
            left: `${headPct.toFixed(2)}%`,
            width: `${unusedPct.toFixed(2)}%`,
          }}
          title={`Unused: ${unusedPct.toFixed(1)}%`}
        />
      )}
      {showTrigger && (
        <div
          className={styles.barTriggerHit}
          style={{ left: `${triggerPct.toFixed(2)}%` }}
          title={`Compaction trigger: fragmentation reaches ${triggerFracPct.toFixed(0)}% of partition`}
        >
          <div className={styles.barTrigger} />
        </div>
      )}
      {isWriteHead && (
        <div
          className={styles.barWriteHeadHit}
          style={{ left: `${headPct.toFixed(2)}%` }}
          title="Active write head"
        >
          <div className={styles.barWriteHead} />
        </div>
      )}
      {isCompacting && (
        <div
          className={styles.barCompactionHeadHit}
          style={{ left: `${compactionPct.toFixed(2)}%` }}
          title={`Compaction progress: ${compactionPct.toFixed(1)}%`}
        >
          <div className={styles.barCompactionHead} />
        </div>
      )}
    </div>
  );
}

interface PartitionTableProps {
  stats: AccountsStats;
}

const TIER_NAMES = ["Hot", "Warm", "Cold"];
const TIER_CLASSES = [styles.tierHot, styles.tierWarm, styles.tierCold];
const TIER_OFF = 255;
const TIER_OFF_NAME = "Off";
const GIB = 1024 * 1024 * 1024;

function fmtOffsetGiB(bytes: number) {
  return `${Math.floor(bytes / GIB)} GiB`;
}

function rateStr(bytesPerSec: number) {
  if (!bytesPerSec) return "—";
  const b = formatBytes(bytesPerSec);
  return `${b.value} ${b.unit}/s`;
}

function fmtOps(v: number) {
  if (v === 0) return "—";
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

function fmtPct(frac: number) {
  return `${Math.min(100, Math.max(0, frac * 100)).toFixed(0)}%`;
}

function fmtSeconds(sec: number) {
  if (!sec || sec < 0) return "—";
  if (sec < 60) return `${sec.toFixed(0)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(0)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

function compactionLabel(state: number) {
  if (state === 2) return "compacting";
  if (state === 1) return "queued";
  return "—";
}

export function PartitionTable({ stats }: PartitionTableProps) {
  const partitions = [...(stats.partitions ?? [])].sort(
    (a, b) => b.partition_idx - a.partition_idx,
  );

  return (
    <Flex direction="column" gap="12px" minWidth="0">
      <Text className={styles.sectionTitle}>Partitions</Text>
      <Table.Root variant="surface" size="1" className={styles.table}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell align="right" className={styles.boldCol}>
              Index
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.primaryCol}>
              Offset
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell
              className={`${styles.primaryCol} ${styles.dividerCol}`}
            >
              Tier
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell className={styles.usageCol}>
              Utilization
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" />
            <Table.ColumnHeaderCell align="right">
              Fragmentation
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Reads/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Writes/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Read IO
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Write IO
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Created
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Filled
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Compacting</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {partitions.map((p) => {
            const isOff = p.tier === TIER_OFF;
            const tierName = isOff
              ? TIER_OFF_NAME
              : (TIER_NAMES[p.tier] ?? `tier ${p.tier}`);
            const tierClass = isOff
              ? styles.tierOff
              : (TIER_CLASSES[p.tier] ?? "");
            const isCompacting = p.compaction_state === 2;
            return (
              <Table.Row
                key={p.partition_idx}
                className={isCompacting ? styles.rowCompacting : undefined}
              >
                <Table.RowHeaderCell
                  align="right"
                  className={`${styles.mono} ${styles.boldCol}`}
                >
                  {p.partition_idx}
                </Table.RowHeaderCell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.primaryCol}`}
                >
                  {fmtOffsetGiB(p.file_offset)}
                </Table.Cell>
                <Table.Cell
                  className={`${styles.primaryCol} ${styles.dividerCol} ${tierClass}`}
                >
                  {tierName}
                </Table.Cell>
                <Table.Cell className={styles.usageCol}>
                  <UsageBar
                    usedFrac={p.used_frac}
                    fragmentedFrac={p.fragmented_frac}
                    compactionTriggerFrac={p.compaction_trigger_frac}
                    isWriteHead={p.is_write_head}
                    compactionFrac={p.compaction_frac}
                    compactionState={p.compaction_state}
                  />
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.pctLabel}`}
                >
                  {fmtPct(p.utilization)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={styles.mono}
                  style={{
                    color: `color-mix(in oklab, var(--gray-12), var(--amber-10) ${Math.min(100, Math.max(0, (p.fragmentation / 0.3) * 100)).toFixed(0)}%)`,
                  }}
                >
                  {fmtPct(p.fragmentation)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtOps(p.read_ops_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtOps(p.write_ops_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {rateStr(p.bytes_read_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {rateStr(p.bytes_written_per_sec)}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {fmtSeconds(p.age_seconds)}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {fmtSeconds(p.filled_seconds)}
                </Table.Cell>
                <Table.Cell>{compactionLabel(p.compaction_state)}</Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
