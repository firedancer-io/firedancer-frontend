import { Flex, Table, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import type { AccountsStats, AccountsTile } from "../../api/types";
import { formatBytes } from "../../utils";
import TileSparkLine from "../Overview/SlotPerformance/TileSparkLine";
import styles from "./accounts.module.css";

const sparkReadColor = "#5b9bd5";
const sparkWriteColor = "#8e4ec6";
const sparkWindowMs = 60_000;
const sparkUpdateIntervalMs = 250;
const sparkTickMs = 250;

function TileSparkCell({ tile }: { tile: AccountsTile }) {
  const { read, write, latestRead, latestWrite } = useMemo(() => {
    const r = tile.acquired_history;
    const w = tile.acquired_writable_history;
    let max = 0;
    for (let i = 0; i < r.length; i++) if (r[i] > max) max = r[i];
    for (let i = 0; i < w.length; i++) if (w[i] > max) max = w[i];
    if (max <= 0) {
      return {
        read: r.map(() => 0),
        write: w.map(() => 0),
        latestRead: 0,
        latestWrite: 0,
      };
    }
    return {
      read: r.map((v) => v / max),
      write: w.map((v) => v / max),
      latestRead: (r[r.length - 1] ?? 0) / max,
      latestWrite: (w[w.length - 1] ?? 0) / max,
    };
  }, [tile.acquired_history, tile.acquired_writable_history]);

  return (
    <TileSparkLine
      value={latestRead}
      history={read}
      value2={latestWrite}
      history2={write}
      windowMs={sparkWindowMs}
      updateIntervalMs={sparkUpdateIntervalMs}
      tickMs={sparkTickMs}
      stroke={sparkReadColor}
      stroke2={sparkWriteColor}
      fill={false}
      background="transparent"
    />
  );
}

interface TileTableProps {
  stats: AccountsStats;
}

function fmtRate(v: number) {
  if (v === 0) return "—";
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

function fmtBytesRate(v: number) {
  if (v === 0) return "—";
  const f = formatBytes(v, 1);
  return `${f.value} ${f.unit}/s`;
}

function fmtBytes(v: number) {
  if (v === 0) return "—";
  const f = formatBytes(v, 1);
  return `${f.value} ${f.unit}`;
}

function fmtCount(v: number) {
  if (v === 0) return "—";
  return v.toLocaleString();
}

export function TileTable({ stats }: TileTableProps) {
  const nameCounts = stats.tiles.reduce<Record<string, number>>((acc, t) => {
    acc[t.name] = (acc[t.name] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <Flex direction="column" gap="12px" minWidth="0">
      <Text className={styles.sectionTitle}>Tiles</Text>
      <Table.Root variant="surface" size="1" className={styles.table}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell
              className={`${styles.primaryCol} ${styles.dividerCol}`}
            >
              Tile
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.hitRateCol}>
              Hit rate
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Acquire/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Acc Reads/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Acc Writes/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell className={styles.sparkCol}>
              <Flex align="center" justify="between" gap="12px" height="100%">
                <Text>
                  Acc R/W <span className={styles.sparkHeaderSub}>(60s)</span>
                </Text>
                <Flex align="center" gap="8px">
                  <Flex align="center" gap="4px">
                    <span className={styles.sparkSwatchRead} />
                    <Text size="1" className={styles.sparkLegend}>
                      R
                    </Text>
                  </Flex>
                  <Flex align="center" gap="4px">
                    <span className={styles.sparkSwatchWrite} />
                    <Text size="1" className={styles.sparkLegend}>
                      W
                    </Text>
                  </Flex>
                </Flex>
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Acc Commits/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Acc Misses/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Acc Evicts/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Disk Read/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Disk Write/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Disk Read
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Disk Write
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Acc Acquired
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {stats.tiles.map((t) => {
            const hitPct = t.hit_rate_ema * 100;
            const readsPerSec = t.acquired_per_sec;
            const writesPerSec = t.acquired_writable_per_sec;
            const hasReads =
              readsPerSec > 0 || writesPerSec > 0 || t.read_ops_per_sec > 0;
            const rowKey = `${t.name}-${t.kind_id}`;
            return (
              <Table.Row key={rowKey}>
                <Table.RowHeaderCell
                  className={`${styles.primaryCol} ${styles.dividerCol}`}
                >
                  {t.name}
                  {(nameCounts[t.name] ?? 0) > 1 ? `:${t.kind_id}` : ""}
                </Table.RowHeaderCell>
                <Table.Cell>{t.joiner_type}</Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.hitRateCol}`}
                >
                  {hasReads ? (
                    <Text
                      className={
                        hitPct >= 100
                          ? styles.statHitRateGood
                          : hitPct > 99.9
                            ? styles.statHitRateWarn
                            : styles.statHitRateBad
                      }
                    >
                      {hitPct.toFixed(2)}%
                    </Text>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(t.acquire_calls_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(readsPerSec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(writesPerSec)}
                </Table.Cell>
                <Table.Cell className={styles.sparkCol}>
                  <TileSparkCell tile={t} />
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(t.committed_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(t.not_found_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(t.evicted_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtBytesRate(t.bytes_read_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtBytesRate(t.bytes_written_per_sec)}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {fmtBytes(t.bytes_read)}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {fmtBytes(t.bytes_written)}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {fmtCount(t.acquired)}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
